import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * 🔴 Arno (23/10/2026, option A) — la reprise des ouvertures datées après la création (ou dans le futur). Base SIMULÉE : rien n'est
 * écrit. À blanc par défaut ; `--reel` en une transaction ; rejouable ; l'ancienne date gardée au journal et notée en carte RDV.
 */
const emis: { sql: string; params: unknown[] }[] = [];
let candidats: Record<string, unknown>[] = [];
let transactions = 0;
vi.mock('../lib/db/client', () => {
  const query = async (sql: string, params: unknown[] = []) => {
    emis.push({ sql, params });
    if (sql.trim().startsWith('WITH ev AS')) return { rows: candidats, rowCount: candidats.length };
    if (/^\s*UPDATE gestion_evenement SET ouvert_le/.test(sql) || /^\s*UPDATE gestion_monga_etape SET survenu_le/.test(sql)) {
      candidats = candidats.filter((c) => !(c.evenement_id === String(params[0]) && c.sorte === 'evenement')
        && !(c.carte_id === String(params[0]) && c.sorte === 'carte'));
    }
    return { rows: [], rowCount: 1 };
  };
  return {
    query, closePool: async () => {},
    withTransaction: async (fn: (q: typeof query) => unknown) => { transactions += 1; return fn(query); },
  };
});
const { passerRepriseOuvertures, AUTEUR_REPRISE_OUVERTURES, TEXTE_RDV_REPRIS } = await import('../lib/gestion/repriseOuverturesRepo');
const { texteRapportOuvertures } = await import('./reparer-ouvertures');

const G10 = (plus: Record<string, unknown> = {}) => ({
  evenement_id: '10', reference: 'GES-2026-000010', objet: 'Avis de passage désinsectisation', bien: 'lot 211 - 39 bis rue Rousselle',
  sorte: 'evenement', carte_id: null, cree: '2026-10-23 09:12:40', cree_brut: '2026-10-23 09:12:40.5+02',
  ouvert: '2026-11-02 12:00:00', ouvert_brut: '2026-11-02 12:00:00+01', futur: true, rdv: 0, rdv_ce_jour: false, rdv_a_poser: true,
  ...plus,
});
beforeEach(() => { emis.length = 0; candidats = []; transactions = 0; });
const ecritures = () => emis.filter((e) => /^\s*(UPDATE|INSERT|DELETE)\b/.test(e.sql));

describe('🔴 à blanc par défaut : la liste, rien d’écrit', () => {
  it('le rapport dit l’intitulé, le bien, la création, l’ouverture saisie, et la carte RDV', async () => {
    candidats = [G10()];
    const p = await passerRepriseOuvertures({ reel: false });
    expect(ecritures()).toHaveLength(0);
    expect(transactions).toBe(0);
    const t = texteRapportOuvertures(p, { base: 'sansvisavis' });
    expect(t).toContain('À BLANC (aucune écriture)');
    expect(t).toContain('GES-2026-000010 — Avis de passage désinsectisation');
    expect(t).toContain('bien : lot 211 - 39 bis rue Rousselle');
    expect(t).toContain('créé le 23/10/2026 à 09:12 · ouverture saisie : 02/11/2026 à 12:00 (DANS LE FUTUR)');
    expect(t).toContain('carte RDV intervention : aucune → une carte RDV serait posée au 02/11/2026');
    expect(t).toContain('→ ouverture serait ramenée au 23/10/2026 à 09:12 (ancienne date gardée au journal)');
  });
  it('le script lit --reel ; son alias npm existe', () => {
    expect(readFileSync('app/scripts/reparer-ouvertures.ts', 'utf8')).toContain("const reel = argv.includes('--reel');");
    expect(readFileSync('package.json', 'utf8')).toContain('"gestion:reparer-ouvertures": "tsx app/scripts/reparer-ouvertures.ts"');
  });
});

describe('🔴 --reel : ouverture ramenée à la création, ancienne date au journal et en carte RDV', () => {
  it('une transaction ; l’ouverture prend l’instant de création ; journal (valeur_avant) ; carte RDV à l’ancienne date', async () => {
    candidats = [G10()];
    const p = await passerRepriseOuvertures({ reel: true });
    expect(transactions).toBe(1);
    expect(p).toMatchObject({ reprises: 1, rdvPoses: 1 });
    const [maj, journal, rdv] = ecritures();
    expect(maj.params).toEqual([10, '2026-10-23 09:12:40.5+02']);
    expect(journal.sql).toContain('INSERT INTO gestion_journal');
    expect(journal.params.slice(0, 3)).toEqual([10, '2026-11-02 12:00:00+01', '2026-10-23 09:12:40.5+02']);
    expect(String(journal.params[3])).toContain('ancienne date en valeur_avant ; carte RDV intervention posée à cette date');
    expect(rdv.sql.replace(/\s+/g, ' ')).toContain("VALUES ($1, 'rdv_intervention', $2::timestamptz, false, true, $3, 'manuelle', 'fiable', $4,");
    expect(rdv.params).toEqual([10, '2026-11-02 12:00:00+01', TEXTE_RDV_REPRIS, AUTEUR_REPRISE_OUVERTURES]);
  });
  it('une RDV existe déjà ce jour-là : aucune seconde carte', async () => {
    candidats = [G10({ rdv: 1, rdv_ce_jour: true, rdv_a_poser: false })];
    await passerRepriseOuvertures({ reel: true });
    expect(ecritures().filter((e) => e.sql.includes('rdv_intervention'))).toHaveLength(0);
  });
  it('une carte Ouverture datée dans le futur est ramenée de même, sur la carte', async () => {
    candidats = [G10({ sorte: 'carte', carte_id: '88', rdv_a_poser: false })];
    await passerRepriseOuvertures({ reel: true });
    expect(ecritures()[0].params).toEqual([88, '2026-10-23 09:12:40.5+02', AUTEUR_REPRISE_OUVERTURES]);
  });
  it('rejouable : la seconde passe ne trouve plus rien et n’écrit rien', async () => {
    candidats = [G10()];
    await passerRepriseOuvertures({ reel: true });
    emis.length = 0;
    expect((await passerRepriseOuvertures({ reel: true })).trouvees).toEqual([]);
    expect(ecritures()).toHaveLength(0);
  });
});
