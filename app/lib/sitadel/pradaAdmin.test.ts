import { describe, it, expect, vi } from 'vitest';
import type { Requete } from './mairieContact';
import { rattacherManuelTx, estIdentifiantValide, lireArbitrages, SQL_RATTACHER_MANUEL, SQL_ECARTER, SQL_LIGNE_IMPORT, SQL_AMBIGUITES } from './pradaAdmin';

// `lireArbitrages` construit son SQL EN LIGNE (pas de constante exportée) : on intercepte `query` pour inspecter la requête
// RÉELLEMENT émise (invariants AGENTS.md : fragments SÉMANTIQUES sur chaîne whitespace-normalisée, jamais une regex sur le WHERE
// complet). Les autres tests du fichier passent leur PROPRE `q` (fauxQ) et ne touchent jamais ce `query` mocké.
const espion = vi.hoisted(() => ({ requetes: [] as { sql: string; params: unknown[] }[], rows: [] as Record<string, unknown>[] }));
vi.mock('../db/client', () => ({
  query: async (sql: string, params?: unknown[]) => { espion.requetes.push({ sql, params: params ?? [] }); return { rows: espion.rows }; },
  withTransaction: async () => { throw new Error('withTransaction ne doit pas être appelé par ces tests'); },
}));

/** Faux `q` (transaction) journalisant chaque requête pour vérifier la SÉQUENCE et les invariants, sans base. */
function fauxQ(opts: { pradaExistante?: { courriel: string | null; protegee?: boolean } } = {}) {
  const appels: { text: string; params: unknown[] }[] = [];
  const q: Requete = (async (text: string, params?: unknown[]) => {
    const p = params ?? [];
    appels.push({ text, params: p });
    if (text.includes('FROM prada_import WHERE id')) {
      return { rows: [{ nom: 'Bernard', prenom: 'Léa', courriel: 'lea@ville.fr', adresse: '6 place', millesime: '2026-07' }] };
    }
    if (text.includes('SELECT courriel FROM mairie_prada')) {
      return { rows: opts.pradaExistante ? [{ courriel: opts.pradaExistante.courriel }] : [] };
    }
    if (text.includes('INSERT INTO mairie_prada') && text.includes('ON CONFLICT (code_insee)')) {
      // protégée (confirme/saisie_manuelle) → 0 ligne retournée ; sinon insertion (xmax=0 => insere true)
      return { rows: opts.pradaExistante?.protegee ? [] : [{ insere: !opts.pradaExistante, courriel: 'lea@ville.fr' }] };
    }
    return { rows: [] };
  }) as Requete;
  return { q, appels };
}

describe('S14e — rattachement manuel (invariants)', () => {
  it('pose rapprochement « manuel » (JAMAIS « automatique »)', () => {
    expect(SQL_RATTACHER_MANUEL).toContain("rapprochement = 'manuel'");
    expect(SQL_RATTACHER_MANUEL).not.toContain("'automatique'");
  });

  it('écarter → rapprochement « hors_perimetre », code_insee NULL', () => {
    expect(SQL_ECARTER).toContain("rapprochement = 'hors_perimetre'");
    expect(SQL_ECARTER).toContain('code_insee = NULL');
  });

  it('la séquence pose « manuel », alimente mairie_prada, journalise — et NE TOUCHE JAMAIS mairie_contact', async () => {
    const { q, appels } = fauxQ();
    await rattacherManuelTx(q, 12, '93070', 'admin-1');

    const rattache = appels.find((a) => a.text === SQL_RATTACHER_MANUEL);
    expect(rattache).toBeTruthy();
    expect(rattache!.params).toEqual(['93070', 12]); // code_insee, id
    expect(appels.some((a) => a.text.includes('INSERT INTO mairie_prada'))).toBe(true);
    expect(appels.some((a) => a.text.includes('INSERT INTO mairie_prada_journal'))).toBe(true);
    // INVARIANT : aucune écriture sur mairie_contact (le contact confirmé reste intact)
    expect(appels.some((a) => /INSERT INTO mairie_contact|UPDATE mairie_contact/.test(a.text))).toBe(false);
    // et jamais 'automatique' écrit
    expect(appels.some((a) => a.params.includes('automatique'))).toBe(false);
  });

  it('mairie_prada protégée (confirme / saisie_manuelle) → aucun journal (rien écrasé)', async () => {
    const { q, appels } = fauxQ({ pradaExistante: { courriel: 'ancien@x.fr', protegee: true } });
    await rattacherManuelTx(q, 12, '93070', null);
    // le rattachement prada_import a bien lieu, mais l'upsert protégé ne renvoie rien → pas de journal
    expect(appels.some((a) => a.text === SQL_RATTACHER_MANUEL)).toBe(true);
    expect(appels.some((a) => a.text.includes('INSERT INTO mairie_prada_journal'))).toBe(false);
  });

  it('lit la ligne source avant d’alimenter mairie_prada', () => {
    expect(SQL_LIGNE_IMPORT).toContain('FROM prada_import WHERE id = $1');
  });
});

describe('S14e — cause du « importId invalide » : bigint sérialisé en chaîne', () => {
  it('la sélection des ambiguïtés caste id::int → identifiant rendu en NOMBRE JSON (pas une chaîne)', () => {
    expect(SQL_AMBIGUITES).toContain('id::int AS id'); // sans ce cast, prada_import.id (bigint) arrive en string
  });

  it('la route exige un ENTIER JS : « 12 » (chaîne, forme d’un bigint sérialisé) est REFUSÉ, la validation reste stricte', () => {
    expect(estIdentifiantValide(12)).toBe(true);        // la forme attendue par la route
    expect(estIdentifiantValide('12')).toBe(false);     // la forme fautive avant correctif → toujours refusée
    expect(estIdentifiantValide(undefined)).toBe(false);// absent → refusé (jamais de rattachement indéterminé)
    expect(estIdentifiantValide(1.5)).toBe(false);
    expect(estIdentifiantValide(null)).toBe(false);
  });
});

describe('Lot 10 §C — « PRADA non adoptée » AU SENS STRICT (courriel PRADA ≠ e-mail de contact retenu)', () => {
  const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();
  const sqlEmis = (): string => norm(espion.requetes.at(-1)!.sql);

  it('le prédicat EXCLUT les communes dont l’e-mail de contact = courriel PRADA (adoption) — comparaison insensible casse/espaces', async () => {
    espion.requetes.length = 0; espion.rows = [];
    await lireArbitrages();
    const sql = sqlEmis();
    // le cœur de la décision Arno (Option 3) : on ne garde que si e-mail ≠ courriel, casse/espaces neutralisés des DEUX côtés.
    expect(sql).toContain("lower(btrim(coalesce(mc.email, ''))) <> lower(btrim(mp.courriel))");
    // ET les gardes historiques CONSERVÉES : courriel PRADA non vide + contact confirmé à la main (rien n’a basculé auto).
    expect(sql).toContain("coalesce(btrim(mp.courriel), '') <> ''");
    expect(sql).toContain("mc.statut = 'confirme'");
    // le CANAL n’entre PAS dans le prédicat (une commune sur un rail reste listée si son contact diffère de sa PRADA).
    expect(sql).not.toContain('mc.canal =');
  });

  it('mappe fidèlement les lignes remontées (une commune non adoptée reste affichée)', async () => {
    espion.requetes.length = 0;
    espion.rows = [{ code_insee: '93047', commune_nom: 'Montfermeil', prada_nom: 'Service CADA', prada_courriel: 'cada@montfermeil.fr',
      contact_canal: 'email', contact_email: 'urbanisme@montfermeil.fr', contact_adresse: null }];
    const arb = await lireArbitrages();
    expect(arb).toEqual([{ codeInsee: '93047', communeNom: 'Montfermeil', pradaNom: 'Service CADA', pradaCourriel: 'cada@montfermeil.fr',
      contactCanal: 'email', contactEmail: 'urbanisme@montfermeil.fr', contactAdressePostale: null }]);
  });
});
