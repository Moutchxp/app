import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * P1 — repo de la RÉFÉRENCE mairie. On mocke ../db/client et on capture chaque (sql, params). Protocole : COMPORTEMENT +
 * PARAMÈTRES LIÉS + SQL par FRAGMENTS whitespace-normalisés (jamais la forme exacte d'un WHERE). Le 23505 de l'unique devient
 * une erreur MÉTIER nommée (409 côté route), jamais une exception brute (503). marquerDeposee greffe la référence sans jamais
 * bloquer le dépôt (ON CONFLICT DO NOTHING).
 */
const { appels, etat, queryMock, withTransactionMock } = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  const etat = { statut: 'prete' as string, canal: 'formulaire' as string | null, conflit23505: false, deleteRowCount: 1 };
  const run = async (sql: string, params?: unknown[]) => {
    appels.push({ sql, params: params ?? [] });
    if (/SELECT statut, dest_canal/i.test(sql)) return { rows: [{ statut: etat.statut, canal: etat.canal }], rowCount: 1 };
    if (/DELETE FROM demande_reference_externe/i.test(sql)) return { rows: [], rowCount: etat.deleteRowCount }; // FUS-4 : effacement
    // INSERT DIRECT (ajouterReferenceExterne, SANS ON CONFLICT) → peut lever 23505 ; la greffe (ON CONFLICT) n'est jamais bloquée.
    if (/INSERT INTO demande_reference_externe/i.test(sql) && !/ON CONFLICT/i.test(sql) && etat.conflit23505) {
      throw Object.assign(new Error('duplicate key'), { code: '23505', constraint: 'demande_reference_externe_demande_id_reference_key' });
    }
    return { rows: [], rowCount: 1 };
  };
  const withTransactionMock = async (fn: (q: typeof run) => Promise<unknown>) => fn(run);
  return { appels, etat, queryMock: run, withTransactionMock };
});
vi.mock('../db/client', () => ({ query: queryMock, withTransaction: withTransactionMock, pool: {}, closePool: async () => undefined }));

import { ajouterReferenceExterne, supprimerReferenceExterne, marquerDeposee, ReferenceDejaEnregistreeError } from './demandeRepo';

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const trouver = (re: RegExp) => appels.find((a) => re.test(a.sql));
beforeEach(() => { appels.length = 0; etat.statut = 'prete'; etat.canal = 'formulaire'; etat.conflit23505 = false; etat.deleteRowCount = 1; });

describe('P1 — ajouterReferenceExterne', () => {
  it('insère avec les paramètres liés, référence NETTOYÉE (trim)', async () => {
    await ajouterReferenceExterne(119, '  SLC260810440700  ', { source: 'accuse_reception' });
    const ins = trouver(/INSERT INTO demande_reference_externe/i)!;
    expect(ins).toBeDefined();
    expect(norm(ins.sql)).toContain('INSERT INTO demande_reference_externe (demande_id, dossier_id, reference, source, note, recu_le)');
    expect(ins.params).toEqual([119, null, 'SLC260810440700', 'accuse_reception', null, null]);
  });

  it('une même référence enregistrée DEUX FOIS → ReferenceDejaEnregistreeError (409 métier), jamais l’erreur brute (503)', async () => {
    etat.conflit23505 = true;
    await expect(ajouterReferenceExterne(119, 'DOUBLON')).rejects.toBeInstanceOf(ReferenceDejaEnregistreeError);
    await expect(ajouterReferenceExterne(119, 'DOUBLON')).rejects.toThrow('déjà enregistrée pour cette demande');
  });

  it('ajout APRÈS COUP (demande déjà déposée) : INSERT seul, n’écrit NI demande NI statut', async () => {
    await ajouterReferenceExterne(119, 'REF', { dossierId: 7 });
    expect(appels.some((a) => /INSERT INTO demande_reference_externe/i.test(a.sql))).toBe(true);
    expect(appels.every((a) => !/UPDATE\s+demande\b/i.test(a.sql) && !/SET\s+statut/i.test(a.sql))).toBe(true);
    // dossier_id lié quand fourni
    expect(trouver(/INSERT INTO demande_reference_externe/i)!.params[1]).toBe(7);
  });
});

describe('B2 — marquerDeposee horodate l’envoi dans le registre d’acheminement', () => {
  it('le dépôt écrit une ligne demande_acheminement (canal formulaire, statut envoye, envoye_le=now) — l’ancre d’échéance', async () => {
    await marquerDeposee(119, 'admin');
    const ach = trouver(/INSERT INTO demande_acheminement/i)!;
    expect(ach, 'le dépôt téléservice doit entrer dans le registre juridique').toBeDefined();
    const sql = norm(ach.sql);
    expect(sql).toContain("(demande_id, canal, statut, envoye_le)");
    expect(sql).toContain("'formulaire'"); // canal téléservice (pas 'email')
    expect(sql).toContain("'envoye'");     // c’est bien parti à la mairie
    expect(sql).toContain('envoye_le');    // l’ancre lue par etatEcheance
    expect(sql).toContain('now()');
    // T4 — 2 params liés : demande_id + date de dépôt (null ici → coalesce bascule sur now(), dépôt en direct). message_id /
    //   retour fournisseur restent NULL (défaut) → aucun artefact e-mail inventé.
    expect(ach.params).toEqual([119, null]);
  });

  it('T4 — une date de dépôt RÉELLE fournie est l’ancre LIÉE (envoye_le = saisie), jamais now() : rattrapage d’une relève', async () => {
    await marquerDeposee(119, 'admin', null, '2026-07-10');
    const ach = trouver(/INSERT INTO demande_acheminement/i)!;
    expect(ach).toBeDefined();
    // La date saisie part en 2e paramètre LIÉ ; coalesce($2, now()) ⇒ c'est ELLE qui ancre l'échéance/forclusion CADA (jamais la date du mail).
    expect(ach.params).toEqual([119, '2026-07-10']);
    expect(norm(ach.sql)).toContain('coalesce($2::timestamptz, now())');
  });

  it('non-régression : le dépôt pose toujours statut=envoyee et journalise « dépôt manuel (téléservice) »', async () => {
    await marquerDeposee(119, 'admin');
    expect(appels.some((a) => /UPDATE demande SET statut = 'envoyee'/i.test(a.sql))).toBe(true);
    expect(appels.some((a) => /INSERT INTO demande_journal/i.test(a.sql) && /dépôt manuel \(téléservice\)/.test(a.sql))).toBe(true);
  });

  // FUS — INVARIANT téléservice : envoye_le PLAFONNÉ au premier accusé rattaché (chronologie copier ≤ dépôt ≤ accusé).
  //   Le clamp est appliqué à l'ÉCRITURE, DB-side (LEAST + sous-requête) : on prouve son ÉMISSION (le mock n'exécute pas le SQL).
  describe('FUS — envoye_le jamais postérieur au premier accusé (clamp LEAST à l’écriture)', () => {
    it('dépôt en direct (now()) : LEAST(coalesce($2, now()), min(accusé)) ⇒ validation postérieure à l’accusé bornée à l’accusé', async () => {
      await marquerDeposee(119, 'admin');
      const sql = norm(trouver(/INSERT INTO demande_acheminement/i)!.sql);
      expect(sql).toContain('LEAST('); // plafonnement
      expect(sql).toContain('coalesce($2::timestamptz, now())'); // l’instant de validation reste l’ancre par défaut
      expect(sql).toContain("FROM demande_reponse r WHERE r.demande_id = $1 AND r.nature = 'accuse'"); // le plafond = 1er accusé
      expect(sql).toContain('min(r.recu_le)'); // « premier » accusé = le plus ancien recu_le
    });

    it('aucun accusé rattaché → coalesce(..., \'infinity\') ⇒ pas de plafond, l’instant de validation reste inchangé', async () => {
      await marquerDeposee(119, 'admin');
      const sql = norm(trouver(/INSERT INTO demande_acheminement/i)!.sql);
      // sous-requête accusé absente ⇒ NULL ⇒ coalesce bascule sur 'infinity' ⇒ LEAST renvoie toujours l’instant de validation.
      expect(sql).toContain("'infinity'::timestamptz");
    });

    it('T4 — date de dépôt RÉELLE fournie : ancre LIÉE ($2) toujours plafonnée à l’accusé (même invariant, un seul endroit)', async () => {
      await marquerDeposee(119, 'admin', null, '2026-07-10');
      const ach = trouver(/INSERT INTO demande_acheminement/i)!;
      expect(ach.params).toEqual([119, '2026-07-10']); // la date saisie reste le 2e paramètre lié
      expect(norm(ach.sql)).toContain('LEAST('); // et passe par le même plafond que le dépôt direct
    });

    it('canal e-mail JAMAIS touché : le clamp vit dans marquerDeposee (canal formulaire codé en dur), pas dans l’envoi e-mail', async () => {
      await marquerDeposee(119, 'admin');
      const sql = norm(trouver(/INSERT INTO demande_acheminement/i)!.sql);
      expect(sql).toContain("'formulaire'"); // le plafond ne s’applique qu’au dépôt téléservice
      expect(sql).not.toContain("'email'");
    });
  });
});

describe('LOT B1 — marquerDeposee résout la présomption de dépôt en « deposee » (lève le verrou de commune)', () => {
  it('le dépôt émet UPDATE demande_depot_presume … resolution = deposee, params liés [id, deposee, auteur], dans la MÊME transaction', async () => {
    await marquerDeposee(119, 'admin');
    const res = trouver(/UPDATE demande_depot_presume/i)!;
    expect(res, 'le dépôt téléservice doit résoudre la présomption').toBeDefined();
    const sql = norm(res.sql);
    expect(sql).toContain('SET resolu_le = now()');
    expect(sql).toContain('WHERE demande_id = $1 AND resolu_le IS NULL'); // présomption VIVANTE seule (idempotent)
    expect(res.params).toEqual([119, 'deposee', 'admin']);
  });

  it('geste sans erreur : la résolution n’ajoute aucune condition d’échec au dépôt (UPDATE émis, no-op côté DB si aucune présomption)', async () => {
    await expect(marquerDeposee(119, 'admin')).resolves.toBeUndefined();
    expect(trouver(/UPDATE demande_depot_presume/i)).toBeDefined();
  });

  it('canal e-mail JAMAIS concerné : marquerDeposee refuse un non-formulaire AVANT toute résolution', async () => {
    etat.canal = 'email';
    await expect(marquerDeposee(119, 'admin')).rejects.toThrow(); // DepotInterditError (garde canal, en amont)
    expect(trouver(/UPDATE demande_depot_presume/i)).toBeUndefined();
  });
});

describe('P1 — marquerDeposee greffe la référence', () => {
  it('avec référence : dépôt (UPDATE + journal) PUIS greffe ON CONFLICT DO NOTHING, dans la même transaction', async () => {
    await marquerDeposee(42, 'admin', '  REF-42 ');
    expect(appels.some((a) => /UPDATE demande SET statut = 'envoyee'/i.test(a.sql))).toBe(true);
    const graft = trouver(/INSERT INTO demande_reference_externe/i)!;
    expect(graft).toBeDefined();
    expect(norm(graft.sql)).toContain('ON CONFLICT (demande_id, reference) DO NOTHING');
    expect(graft.params).toEqual([42, 'REF-42']); // référence trimée
  });

  it('sans référence (absente ou vide après trim) → AUCUNE greffe (dépôt seul)', async () => {
    await marquerDeposee(42, 'admin');
    expect(appels.some((a) => /INSERT INTO demande_reference_externe/i.test(a.sql))).toBe(false);
    appels.length = 0;
    await marquerDeposee(42, 'admin', '   ');
    expect(appels.some((a) => /INSERT INTO demande_reference_externe/i.test(a.sql))).toBe(false);
  });

  it('un doublon de référence NE BLOQUE JAMAIS le dépôt (la greffe est ON CONFLICT DO NOTHING)', async () => {
    etat.conflit23505 = true; // n'affecte que l'INSERT DIRECT, pas la greffe
    await expect(marquerDeposee(42, 'admin', 'REF')).resolves.toBeUndefined();
  });
});

describe('FUS-4 — supprimerReferenceExterne (effacer une référence, jamais défaire un envoi)', () => {
  it('DELETE par (demande_id, reference) NETTOYÉE ; renvoie true si une ligne retirée', async () => {
    const ok = await supprimerReferenceExterne(119, '  SLC260810440700  ');
    const del = trouver(/DELETE FROM demande_reference_externe/i)!;
    expect(del).toBeDefined();
    expect(norm(del.sql)).toContain('DELETE FROM demande_reference_externe WHERE demande_id = $1 AND reference = $2');
    expect(del.params).toEqual([119, 'SLC260810440700']); // référence trimée
    expect(ok).toBe(true);
  });

  it('référence absente → false (idempotent), sans erreur', async () => {
    etat.deleteRowCount = 0;
    expect(await supprimerReferenceExterne(119, 'INCONNUE')).toBe(false);
  });

  it('🔴 n’écrit NI demande.statut NI envoye_le NI acheminement (effacer ne défait aucun envoi)', async () => {
    await supprimerReferenceExterne(119, 'REF');
    expect(appels.every((a) => !/UPDATE\s+demande\b|SET\s+statut|envoye_le|demande_acheminement/i.test(a.sql))).toBe(true);
  });
});
