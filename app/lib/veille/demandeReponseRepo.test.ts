import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * R1 — repo des RÉPONSES entrantes. On mocke `../db/client` (modèle demandeRepoTransition.test.ts) et on capture chaque
 * (sql, params) émis. Protocole : on assère le COMPORTEMENT et les PARAMÈTRES LIÉS ; le SQL n'est vérifié que par
 * FRAGMENTS sémantiques sur une chaîne whitespace-normalisée, jamais par sa forme exacte.
 */
const { appels, etat, queryMock, withTransactionMock } = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  // T1 : `tous` pilote le bool_and de synchroniserTraiteeDemande ; `conflitActif` pilote la sonde de conflit du ré-attachement.
  const etat = { rows: [] as unknown[], rowCount: 1, conflit: false, tous: undefined as boolean | undefined, conflitActif: false, statutCible: undefined as string | undefined };
  const queryMock = async (sql: string, params?: unknown[]) => {
    appels.push({ sql, params: params ?? [] });
    return { rows: etat.rows, rowCount: etat.rowCount };
  };
  const withTransactionMock = async (fn: (q: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>) => Promise<unknown>) => {
    const q = async (sql: string, params?: unknown[]) => {
      appels.push({ sql, params: params ?? [] });
      // ON CONFLICT DO NOTHING : conflit → 0 ligne renvoyée (message déjà connu).
      if (/RETURNING id/i.test(sql)) return etat.conflit ? { rows: [], rowCount: 0 } : { rows: [{ id: 4242 }], rowCount: 1 };
      // T1 — synchroniserTraiteeDemande : bool_and des dossiers statués (undefined → aucune ligne, comme une demande vidée).
      if (/bool_and/i.test(sql)) return { rows: etat.tous === undefined ? [] : [{ tous: etat.tous }], rowCount: 1 };
      // T1 — sonde de conflit du ré-attachement (dossier déjà actif sur une AUTRE demande).
      if (/AND actif AND demande_id <> \$2/i.test(sql)) return { rows: etat.conflitActif ? [{ demande_id: 999 }] : [], rowCount: etat.conflitActif ? 1 : 0 };
      // T4 — garde de rattacherAMain : SELECT statut de la demande cible. undefined → aucune ligne (statut inconnu → la garde passe, comme avant la garde).
      if (/SELECT statut FROM demande WHERE id = \$1/i.test(sql)) return { rows: etat.statutCible === undefined ? [] : [{ statut: etat.statutCible }], rowCount: 1 };
      // Les autres requêtes transactionnelles honorent etat.rowCount (permet de tester l'idempotence : 0 ligne → pas de journal).
      return { rows: [], rowCount: etat.rowCount };
    };
    return fn(q);
  };
  return { appels, etat, queryMock, withTransactionMock };
});

vi.mock('../db/client', () => ({
  query: queryMock,
  withTransaction: withTransactionMock,
  pool: {},
  closePool: async () => undefined,
}));

import {
  enregistrerReponse, listerReponses, rattacherAMain, marquerTraitee, deposerEtLierPieces,
  marquerDossierSatisfait, demarquerDossier, statutDemande, lireClePiece,
  marquerDossierNonFourni, marquerDossierRefusMairie, annulerTriageDossier, retirerDossierDemande, reattacherDossierDemande,
  lireRecuLeReponse, RattachementNonEnvoyeeError,
  type ReponseEntrante, type PieceAvecContenu,
} from './demandeReponseRepo';
import type { ResultatDepotEntrant } from '../stockage';

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const trouver = (fragment: RegExp) => appels.find((a) => fragment.test(a.sql));

beforeEach(() => { appels.length = 0; etat.rows = []; etat.rowCount = 1; etat.conflit = false; etat.tous = undefined; etat.conflitActif = false; etat.statutCible = undefined; });

describe('T1 — statuer un dossier ligne par ligne', () => {
  it('« non fourni » : triage=non_fourni, garde actif/non reçu/non trié, journalisé, reste dû (aucun satisfait_le posé)', async () => {
    const ok = await marquerDossierNonFourni(119, 7, 'admin');
    expect(ok).toBe(true);
    const upd = trouver(/UPDATE demande_dossier SET triage = 'non_fourni'/i)!;
    expect(upd).toBeDefined();
    const s = norm(upd.sql);
    expect(s).toContain('actif AND satisfait_le IS NULL AND triage IS NULL'); // garde : jamais un reçu, jamais un re-triage
    expect(s).not.toContain('satisfait_le = now'); // reste DÛ
    expect(trouver(/INSERT INTO demande_journal/i)).toBeDefined();
  });

  it('« refus mairie » : triage=refus_mairie + refus_le lié (date de notification), garde identique', async () => {
    const ok = await marquerDossierRefusMairie(119, 7, '2026-08-10', 'admin');
    expect(ok).toBe(true);
    const upd = trouver(/UPDATE demande_dossier SET triage = 'refus_mairie'/i)!;
    expect(upd).toBeDefined();
    expect(norm(upd.sql)).toContain('refus_le = $3::date');
    expect(upd.params).toEqual([119, 7, '2026-08-10']); // la date de notification pilote la CADA
  });

  it('« retirer » : actif=false, GARDE ABSOLUE satisfait_le IS NULL (jamais un dossier obtenu), triage effacé, journalisé', async () => {
    const ok = await retirerDossierDemande(119, 7, 'admin');
    expect(ok).toBe(true);
    const upd = trouver(/UPDATE demande_dossier SET actif = false/i)!;
    expect(upd).toBeDefined();
    const s = norm(upd.sql);
    expect(s).toContain('actif AND satisfait_le IS NULL');   // ne détache JAMAIS un satisfait
    expect(s).toContain('triage = NULL');                     // le dossier quitte la demande
    expect(trouver(/INSERT INTO demande_journal/i)).toBeDefined();
  });

  it('ré-attacher (annuler retrait) — CONFLIT : dossier déjà actif ailleurs → « conflit », AUCUN UPDATE actif=true, jamais un 23505', async () => {
    etat.conflitActif = true;
    const r = await reattacherDossierDemande(119, 7, 'admin');
    expect(r).toBe('conflit');
    expect(trouver(/UPDATE demande_dossier SET actif = true/i)).toBeUndefined(); // on ne tente JAMAIS l'UPDATE nu
    expect(trouver(/INSERT INTO demande_journal/i)).toBeUndefined();
  });

  it('ré-attacher — OK : pas de conflit → UPDATE actif=true (WHERE NOT actif) + journal → « reattache »', async () => {
    etat.conflitActif = false; etat.rowCount = 1;
    const r = await reattacherDossierDemande(119, 7, 'admin');
    expect(r).toBe('reattache');
    expect(norm(trouver(/UPDATE demande_dossier SET actif = true/i)!.sql)).toContain('NOT actif');
    expect(trouver(/INSERT INTO demande_journal/i)).toBeDefined();
  });

  it('ré-attacher — INTROUVABLE : aucun lien inactif (rowCount 0) → « introuvable », pas de journal', async () => {
    etat.conflitActif = false; etat.rowCount = 0;
    expect(await reattacherDossierDemande(119, 7, 'admin')).toBe('introuvable');
    expect(trouver(/INSERT INTO demande_journal/i)).toBeUndefined();
  });

  it('annuler un triage : remet triage/triage_le/refus_le à NULL, garde actif ET trié', async () => {
    const ok = await annulerTriageDossier(119, 7, 'admin');
    expect(ok).toBe(true);
    const s = norm(trouver(/UPDATE demande_dossier SET triage = NULL/i)!.sql);
    expect(s).toContain('refus_le = NULL');
    expect(s).toContain('actif AND triage IS NOT NULL');
  });

  it('TOUS les dossiers statués → fermeture AUTOMATIQUE (traite_le=now, traite_auto=true, WHERE traite_le IS NULL)', async () => {
    etat.tous = true;
    await marquerDossierNonFourni(119, 7, 'admin');
    const sync = trouver(/UPDATE demande_reponse SET traite_le = now\(\)/i)!;
    expect(sync).toBeDefined();
    const s = norm(sync.sql);
    expect(s).toContain('traite_auto = true'); // marque l'origine automatique
    expect(s).toContain('traite_le IS NULL');
    expect(trouver(/SET traite_le = NULL/i)).toBeUndefined();
  });

  it('RÉVERSIBILITÉ + Correction closure-origin : dé-statuer ne rouvre QUE les fermetures AUTO (WHERE traite_auto), jamais une fermeture MANUELLE', async () => {
    etat.tous = false; // après annulation, un dossier redevient dû
    await annulerTriageDossier(119, 7, 'admin');
    const rouvre = trouver(/UPDATE demande_reponse SET traite_le = NULL/i)!;
    expect(rouvre).toBeDefined();
    const s = norm(rouvre.sql);
    expect(s).toContain('traite_le IS NOT NULL AND traite_auto'); // ← ciblé : seules les fermetures automatiques
    expect(trouver(/SET traite_le = now\(\)/i)).toBeUndefined();
  });
});

const RECU = new Date('2026-08-04T21:30:00.000Z');
const BASE: ReponseEntrante = {
  profilBoite: 'entreprise',
  messageId: '<29d85848-20c3-1430-45fe-81c7bcf9cafe@sansvisavis.com>', // AVEC chevrons
  deAdresse: 'urba-reglementaire@mairie-aubervilliers.fr',
  recuLe: RECU,
};

describe('R1 — enregistrerReponse', () => {
  it('insère dans demande_reponse (RETURNING id) avec les paramètres liés dans l’ordre du schéma, et renvoie l’id', async () => {
    const id = await enregistrerReponse({
      ...BASE, demandeId: 154, inReplyTo: '<in@reply>', referencesBrut: '<a> <b>', deNom: 'Mairie', objet: 'RE: réf.',
      corpsTexte: 'texte', rattachementMethode: 'message_id', rattacheLe: RECU, note: 'n',
    });
    expect(id).toBe(4242);
    const ins = trouver(/INSERT INTO demande_reponse\b/i);
    expect(ins).toBeDefined();
    expect(norm(ins!.sql)).toContain('INSERT INTO demande_reponse');
    expect(norm(ins!.sql)).toContain('ON CONFLICT (message_id) DO NOTHING'); // idempotence (R3)
    expect(norm(ins!.sql)).toContain('RETURNING id');
    // paramètres liés, dans l'ordre du schéma (T3 : nature en dernier, défaut 'indetermine')
    expect(ins!.params).toEqual([
      154, 'entreprise', '<29d85848-20c3-1430-45fe-81c7bcf9cafe@sansvisavis.com>', '<in@reply>', '<a> <b>',
      'urba-reglementaire@mairie-aubervilliers.fr', 'Mairie', 'RE: réf.', RECU, 'texte', 'message_id', RECU, 'n', 'indetermine',
    ]);
  });

  it('T3 — nature liée : défaut « indetermine », et la valeur fournie (accuse/rebond) est passée en dernier paramètre', async () => {
    await enregistrerReponse({ ...BASE, nature: 'accuse' });
    const ins = trouver(/INSERT INTO demande_reponse\b/i)!;
    expect(norm(ins.sql)).toContain('nature'); // colonne présente dans l'INSERT
    expect(ins.params[13]).toBe('accuse');
    appels.length = 0;
    await enregistrerReponse({ ...BASE, nature: 'rebond' });
    expect(trouver(/INSERT INTO demande_reponse\b/i)!.params[13]).toBe('rebond');
    appels.length = 0;
    await enregistrerReponse(BASE); // sans nature → défaut
    expect(trouver(/INSERT INTO demande_reponse\b/i)!.params[13]).toBe('indetermine');
  });

  it('demandeId absent → NULL lié (file « à rattacher ») et rattachement_methode défaut « aucun »', async () => {
    await enregistrerReponse(BASE);
    const ins = trouver(/INSERT INTO demande_reponse\b/i)!;
    expect(ins.params[0]).toBeNull();            // demande_id
    expect(ins.params[10]).toBe('aucun');        // rattachement_methode (défaut)
    expect(ins.params[11]).toBeNull();           // rattache_le
    expect(ins.params[2]).toBe(BASE.messageId);  // message_id AVEC chevrons, tel quel
  });

  it('chaque pièce est insérée dans demande_reponse_piece avec le reponse_id lié (dépôt non fait → cle_stockage NULL)', async () => {
    await enregistrerReponse({ ...BASE, pieces: [{ nomFichier: 'PC2.pdf', typeMime: 'application/pdf', tailleOctets: 12345 }] });
    const pj = trouver(/INSERT INTO demande_reponse_piece\b/i);
    expect(pj).toBeDefined();
    expect(pj!.params[0]).toBe(4242);            // reponse_id = id RETURNING
    expect(pj!.params[1]).toBe('PC2.pdf');
    expect(pj!.params[2]).toBe('application/pdf');
    expect(pj!.params[3]).toBe(12345);
    expect(pj!.params[4]).toBeNull();            // cle_stockage : rien déposé dans ce chantier
    expect(pj!.params[6]).toBeNull();            // stocke_le
  });

  it('sans pièces : aucun INSERT dans demande_reponse_piece', async () => {
    await enregistrerReponse(BASE);
    expect(trouver(/INSERT INTO demande_reponse_piece\b/i)).toBeUndefined();
  });

  it('message déjà connu (ON CONFLICT message_id) → renvoie null et n’insère aucune pièce', async () => {
    etat.conflit = true;
    const id = await enregistrerReponse({ ...BASE, pieces: [{ nomFichier: 'PC2.pdf', typeMime: 'application/pdf' }] });
    expect(id).toBeNull();
    expect(trouver(/INSERT INTO demande_reponse_piece\b/i)).toBeUndefined();
  });
});

describe('R4 — deposerEtLierPieces (dépôt injecté, base mockée)', () => {
  const PIECES = (n: number): PieceAvecContenu[] => Array.from({ length: n }, (_, i) => ({ nomFichier: `f${i}.pdf`, typeMime: 'application/pdf', contenu: Buffer.from(`x${i}`) }));

  it('type accepté → déposé : persiste cle_stockage + empreinte ; deposer appelé SANS le nom d’origine', async () => {
    etat.rows = [{ id: 100, cle_stockage: null }]; // ligne de pièce renvoyée par le SELECT
    const deposer = vi.fn(async (): Promise<ResultatDepotEntrant> => ({ depose: true, cle: 'demandes/1/reponses/4242/uuid.pdf', taille: 2, empreinte: 'abc123' }));
    const bilan = await deposerEtLierPieces(4242, 1, PIECES(1), 50 * 1024 * 1024, deposer);

    expect(bilan).toEqual({ deposees: 1, nonDeposees: 0 });
    // deposer reçoit (contenu, typeMime, opts) — JAMAIS le nomFichier → le nom d'origine ne peut pas entrer dans la clé.
    expect(deposer).toHaveBeenCalledWith(Buffer.from('x0'), 'application/pdf', { demandeId: 1, reponseId: 4242, tailleMaxOctets: 50 * 1024 * 1024 });
    const upd = trouver(/SET cle_stockage/i);
    expect(upd?.params).toEqual([100, 'demandes/1/reponses/4242/uuid.pdf', 2, 'abc123']);
  });

  it('type refusé → non déposé : ligne conservée, motif renseigné', async () => {
    etat.rows = [{ id: 100, cle_stockage: null }];
    const deposer = vi.fn(async (): Promise<ResultatDepotEntrant> => ({ depose: false, motif: 'type non autorisé pour le dépôt : « x/x »' }));
    const bilan = await deposerEtLierPieces(4242, 1, PIECES(1), 50 * 1024 * 1024, deposer);

    expect(bilan).toEqual({ deposees: 0, nonDeposees: 1 });
    const upd = trouver(/SET motif_non_stocke/i);
    expect(upd?.params).toEqual([100, 'type non autorisé pour le dépôt : « x/x »']);
  });

  it('IDEMPOTENCE : pièce déjà déposée (cle_stockage renseignée) → deposer JAMAIS rappelé', async () => {
    etat.rows = [{ id: 100, cle_stockage: 'demandes/1/reponses/4242/deja.pdf' }];
    const deposer = vi.fn(async (): Promise<ResultatDepotEntrant> => ({ depose: true, cle: 'x', taille: 1, empreinte: 'y' }));
    const bilan = await deposerEtLierPieces(4242, 1, PIECES(1), 50 * 1024 * 1024, deposer);

    expect(deposer).not.toHaveBeenCalled();
    expect(bilan.deposees).toBe(1);
  });

  it('ISOLATION : l’échec d’UNE pièce n’empêche ni les autres ni la réponse (aucune exception)', async () => {
    etat.rows = [{ id: 100, cle_stockage: null }, { id: 101, cle_stockage: null }];
    let call = 0;
    const deposer = vi.fn(async (): Promise<ResultatDepotEntrant> => {
      call += 1;
      if (call === 1) throw new Error('S3 down');
      return { depose: true, cle: 'demandes/1/reponses/4242/ok.pdf', taille: 2, empreinte: 'ok' };
    });
    const bilan = await deposerEtLierPieces(4242, 1, PIECES(2), 50 * 1024 * 1024, deposer);

    expect(bilan).toEqual({ deposees: 1, nonDeposees: 1 });
    const echec = appels.find((a) => /SET motif_non_stocke/i.test(a.sql) && String(a.params[1]).includes('échec de dépôt'));
    expect(echec).toBeDefined();
  });

  it('réponse NON rattachée → deposer reçoit demandeId null (clé « non-rattachees »)', async () => {
    etat.rows = [{ id: 100, cle_stockage: null }];
    const deposer = vi.fn(async (): Promise<ResultatDepotEntrant> => ({ depose: true, cle: 'demandes/non-rattachees/4242/uuid.pdf', taille: 2, empreinte: 'z' }));
    await deposerEtLierPieces(4242, null, PIECES(1), 50 * 1024 * 1024, deposer);

    expect(deposer).toHaveBeenCalledWith(expect.anything(), 'application/pdf', { demandeId: null, reponseId: 4242, tailleMaxOctets: 50 * 1024 * 1024 });
  });
});

describe('R1 — listerReponses (filtres par paramètre lié, jamais d’interpolation)', () => {
  it('par demande_id → clause paramétrée + paramètre lié', async () => {
    await listerReponses({ demandeId: 154 });
    const sel = trouver(/FROM demande_reponse/i)!;
    expect(sel.params).toEqual([154]);
    expect(norm(sel.sql)).toContain('WHERE demande_id = $1');
    expect(norm(sel.sql)).toContain('ORDER BY recu_le DESC');
  });

  it('non rattachées → WHERE demande_id IS NULL, aucun paramètre', async () => {
    await listerReponses({ nonRattachees: true });
    const sel = trouver(/FROM demande_reponse/i)!;
    expect(sel.params).toEqual([]);
    expect(norm(sel.sql)).toContain('WHERE demande_id IS NULL');
  });

  it('sans filtre → aucune clause WHERE, aucun paramètre', async () => {
    await listerReponses();
    const sel = trouver(/FROM demande_reponse/i)!;
    expect(sel.params).toEqual([]);
    expect(norm(sel.sql)).not.toContain('WHERE');
  });

  it('mappe les colonnes snake_case → camelCase', async () => {
    etat.rows = [{
      id: 7, demande_id: 154, profil_boite: 'entreprise', message_id: '<x@y>', de_adresse: 'a@b', de_nom: 'Mairie',
      objet: 'RE', recu_le: '2026-08-04 21:30:00+00', rattachement_methode: 'message_id',
      rattache_le: '2026-08-05 09:00:00+00', traite_le: null, note: null, cree_le: '2026-08-05 09:00:00+00',
    }];
    const [r] = await listerReponses({ demandeId: 154 });
    expect(r).toEqual({
      id: 7, demandeId: 154, profilBoite: 'entreprise', messageId: '<x@y>', deAdresse: 'a@b', deNom: 'Mairie',
      objet: 'RE', recuLe: '2026-08-04 21:30:00+00', rattachementMethode: 'message_id',
      rattacheLe: '2026-08-05 09:00:00+00', traiteLe: null, note: null, creeLe: '2026-08-05 09:00:00+00',
    });
  });
});

describe('R1 — rattacherAMain (n’écrit JAMAIS demande.statut)', () => {
  it('pose demande_id + méthode « manuel » + rattache_le, consigne l’auteur, renvoie true si une ligne est modifiée', async () => {
    etat.rowCount = 1;
    const ok = await rattacherAMain(7, 154, 'a.jorel');
    expect(ok).toBe(true);
    const upd = trouver(/UPDATE demande_reponse\b/i)!;
    expect(upd.params).toEqual([7, 154, 'rattaché à la main par a.jorel']);
    const s = norm(upd.sql);
    expect(s).toContain("rattachement_methode = 'manuel'");
    expect(s).toContain('rattache_le = now()');
    // ne touche PAS demande.statut : la seule table ciblée est demande_reponse, aucun 'statut'
    expect(s).toContain('UPDATE demande_reponse');
    expect(s).not.toContain('statut');
    expect(appels.some((a) => /UPDATE\s+demande\b(?!_reponse)/i.test(a.sql))).toBe(false);
    // AUCUN dossier satisfait au passage : rattacher un message ≠ noter qu'il apporte une pièce (deux gestes distincts, R5b).
    expect(appels.some((a) => /demande_dossier/i.test(a.sql))).toBe(false);
  });

  it('aucune ligne modifiée → false', async () => {
    etat.rowCount = 0;
    expect(await rattacherAMain(999, 154, 'a.jorel')).toBe(false);
  });

  it('T4 — GARDE : rattachement vers une demande NON envoyée (brouillon/prête) → RattachementNonEnvoyeeError, AUCUN UPDATE', async () => {
    etat.statutCible = 'brouillon';
    await expect(rattacherAMain(7, 154, 'a.jorel')).rejects.toBeInstanceOf(RattachementNonEnvoyeeError);
    // la garde tombe AVANT toute écriture : le message reste dans « Dépôts à confirmer », rien n'est rattaché à une non-envoyée
    expect(trouver(/UPDATE demande_reponse\b/i)).toBeUndefined();
    appels.length = 0;
    etat.statutCible = 'prete';
    await expect(rattacherAMain(7, 154, 'a.jorel')).rejects.toThrow('réservé aux demandes envoyées');
    expect(trouver(/UPDATE demande_reponse\b/i)).toBeUndefined();
  });

  it('T4 — GARDE inerte pour une demande ENVOYÉE : le rattachement passe normalement (true)', async () => {
    etat.statutCible = 'envoyee'; etat.rowCount = 1;
    expect(await rattacherAMain(7, 154, 'a.jorel')).toBe(true);
    expect(trouver(/UPDATE demande_reponse\b/i)).toBeDefined();
  });
});

describe('R1 — marquerTraitee (idempotent, n’écrit pas demande.statut)', () => {
  it('pose traite_le=now() gardé par traite_le IS NULL, renvoie true', async () => {
    etat.rowCount = 1;
    const ok = await marquerTraitee(9);
    expect(ok).toBe(true);
    const upd = trouver(/UPDATE demande_reponse\b/i)!;
    expect(upd.params).toEqual([9]);
    const s = norm(upd.sql);
    expect(s).toContain('traite_le = now()');
    expect(s).toContain('traite_le IS NULL');   // idempotence
    expect(s).not.toContain('statut');
  });

  it('déjà traitée → aucune ligne → false', async () => {
    etat.rowCount = 0;
    expect(await marquerTraitee(9)).toBe(false);
  });
});

describe('R6c/R5b — marquerDossierSatisfait (manuel) : satisfait_par « manuel », journalisé, idempotent', () => {
  it('happy path → UPDATE demande_dossier (satisfait_par=manuel) + INSERT demande_journal (statut NULL/NULL), renvoie true', async () => {
    etat.rowCount = 1;
    const ok = await marquerDossierSatisfait(154, 12, 4242, 'a.jorel');
    expect(ok).toBe(true);
    const upd = trouver(/UPDATE demande_dossier\b/i)!;
    const s = norm(upd.sql);
    expect(s).toContain("satisfait_par = 'manuel'");
    expect(s).toContain('satisfait_le = now()');
    expect(s).toContain('satisfait_le IS NULL');   // idempotence : ne marque QUE ce qui est encore dû
    expect(upd.params).toEqual([154, 12, 4242]);
    const jrn = trouver(/INSERT INTO demande_journal\b/i)!;
    expect(norm(jrn.sql)).toContain('VALUES ($1, NULL, NULL, $2, $3)'); // statut_avant/apres NON écrits (demande.statut sans écrivain)
    expect(jrn.params).toEqual([154, 'dossier 12 marqué satisfait à la main', 'a.jorel']);
  });

  it('déjà satisfait (0 ligne) → false ET aucun journal', async () => {
    etat.rowCount = 0;
    expect(await marquerDossierSatisfait(154, 12, null, 'a.jorel')).toBe(false);
    expect(trouver(/INSERT INTO demande_journal\b/i)).toBeUndefined();
  });
});

describe('R5b — demarquerDossier : les TROIS colonnes reviennent à NULL, journalisé, idempotent', () => {
  it('happy path → UPDATE remet satisfait_le/satisfait_par/reponse_id à NULL + journal, renvoie true', async () => {
    etat.rowCount = 1;
    const ok = await demarquerDossier(154, 12, 'a.jorel');
    expect(ok).toBe(true);
    const upd = trouver(/UPDATE demande_dossier\b/i)!;
    const s = norm(upd.sql);
    expect(s).toContain('satisfait_le = NULL');
    expect(s).toContain('satisfait_par = NULL');
    expect(s).toContain('reponse_id = NULL');
    expect(s).toContain('satisfait_le IS NOT NULL'); // ne démarque QUE ce qui était satisfait
    expect(upd.params).toEqual([154, 12]);
    const jrn = trouver(/INSERT INTO demande_journal\b/i)!;
    expect(norm(jrn.sql)).toContain('VALUES ($1, NULL, NULL, $2, $3)');
    expect(jrn.params).toEqual([154, 'dossier 12 : satisfaction annulée à la main', 'a.jorel']);
  });

  it('rien à démarquer (0 ligne) → false ET aucun journal (idempotent)', async () => {
    etat.rowCount = 0;
    expect(await demarquerDossier(154, 12, 'a.jorel')).toBe(false);
    expect(trouver(/INSERT INTO demande_journal\b/i)).toBeUndefined();
  });
});

describe('R5b — statutDemande / lireClePiece : LECTURE seule', () => {
  it('statutDemande → statut de la ligne (paramètre lié), null si demande absente', async () => {
    etat.rows = [{ statut: 'envoyee' }];
    expect(await statutDemande(154)).toBe('envoyee');
    const sel = trouver(/FROM demande\b/i)!;
    expect(norm(sel.sql)).toContain('SELECT statut FROM demande');
    expect(sel.params).toEqual([154]);
    appels.length = 0;
    etat.rows = [];
    expect(await statutDemande(999)).toBeNull();
  });

  it('lireClePiece → clé de la pièce, null si absente ou non déposée ; que des SELECT', async () => {
    etat.rows = [{ cle_stockage: 'demandes/1/reponses/4242/uuid.pdf' }];
    expect(await lireClePiece(50)).toBe('demandes/1/reponses/4242/uuid.pdf');
    const sel = trouver(/FROM demande_reponse_piece\b/i)!;
    expect(norm(sel.sql)).toContain('SELECT cle_stockage FROM demande_reponse_piece');
    expect(sel.params).toEqual([50]);
    etat.rows = [{ cle_stockage: null }];
    expect(await lireClePiece(51)).toBeNull(); // déposée=false → cle NULL
    etat.rows = [];
    expect(await lireClePiece(52)).toBeNull(); // pièce absente
    expect(appels.every((a) => /^\s*SELECT/i.test(a.sql))).toBe(true);
  });

  it('T4 — lireRecuLeReponse → jour de réception (recu_le::date), paramètre lié ; null si message absent ; que du SELECT', async () => {
    etat.rows = [{ recu_le: '2026-08-04' }];
    expect(await lireRecuLeReponse(4242)).toBe('2026-08-04'); // borne serveur : le dépôt ne peut être postérieur au message
    const sel = trouver(/FROM demande_reponse\b/i)!;
    expect(norm(sel.sql)).toContain('SELECT recu_le::date::text AS recu_le FROM demande_reponse');
    expect(sel.params).toEqual([4242]);
    etat.rows = [];
    expect(await lireRecuLeReponse(999)).toBeNull();
    expect(appels.every((a) => /^\s*SELECT/i.test(a.sql))).toBe(true);
  });
});

describe('R5b — demande.statut n’est écrit dans AUCUN chemin d’action (assertion explicite)', () => {
  it('rattacher / marquer / démarquer / traiter : jamais d’UPDATE demande (table) ni de SET statut', async () => {
    etat.rowCount = 1;
    await rattacherAMain(7, 154, 'a.jorel');
    await marquerDossierSatisfait(154, 12, 4242, 'a.jorel');
    await demarquerDossier(154, 12, 'a.jorel');
    await marquerTraitee(9);
    // La table `demande` (statut, clôture) reste SANS écrivain : demande_reponse / demande_dossier / demande_journal OK, demande NON.
    expect(appels.some((a) => /UPDATE\s+demande\b/i.test(a.sql))).toBe(false);
    expect(appels.some((a) => /\bSET\s+statut\b/i.test(a.sql))).toBe(false);
  });
});
