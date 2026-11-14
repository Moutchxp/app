import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 Arno (14/11/2026, 473) — LE PRÉAVIS DE TEST EN BASE : le périmètre d'un geste (un test mêlé à de vrais biens : refus), la visibilité
 * (personne ne voit le test d'un autre ; les compteurs ne le voient jamais), la route qui s'exécute dans le périmètre. Base simulée.
 */
const appels: { sql: string; params: unknown[] }[] = [];
let tests: { id: string; lot_id: string; occupation_id: string; locataire_id: string; createur_id: string; createur_email: string; supprime_le: string | null }[] = [];
let lotsDesOccupations: Record<string, string> = {};
vi.mock('../db/client', () => ({
  query: async (sql: string, params: unknown[] = []) => {
    appels.push({ sql: sql.replace(/\s+/g, ' '), params });
    if (sql.includes('to_regclass')) return { rows: [{ t: 'gestion_location_preavis_test' }] };
    if (sql.includes('FROM gestion_location_preavis_test t') && sql.includes('OR t.lot_id = ANY')) {
      const [occ, lots] = params as [number[], number[]];
      const lotsVises = new Set([...occ.map((o) => lotsDesOccupations[String(o)]), ...lots.map(String)]);
      return { rows: tests.filter((t) => lotsVises.has(t.lot_id)) };
    }
    if (sql.includes('SELECT DISTINCT lot_id::text FROM gestion_annuaire_occupation')) {
      return { rows: [...new Set((params[0] as number[]).map((o) => lotsDesOccupations[String(o)]))].map((l) => ({ lot_id: l })) };
    }
    return { rows: [] };
  },
  withTransaction: async () => { throw new Error('pas d’écriture dans ces épreuves'); },
}));

vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => true }));
vi.mock('./bailRepo', async (orig) => ({ ...(await orig()), bailDisponible: async () => true }));
vi.mock('./edlsRepo', async (orig) => ({ ...(await orig()), edlsDesOccupations: async () => [], edlsDisponible: async () => true }));

const { perimetreDuGeste, sqlHorsTest, oublierSondeTest } = await import('./preavisTestRepo');

beforeEach(() => {
  appels.length = 0; oublierSondeTest();
  tests = [{ id: '3', lot_id: '900', occupation_id: '5000', locataire_id: '70', createur_id: '1', createur_email: 'a.jorel@sansvisavis.com', supprime_le: null }];
  lotsDesOccupations = { 5000: '900', 11: '7', 12: '7' };
});

describe('perimetreDuGeste', () => {
  it('aucun test : geste ordinaire', async () => {
    expect(await perimetreDuGeste({ occupationIds: [11, 12] })).toEqual({ ok: true, perimetre: null });
  });
  it('l’occupation d’un test : son périmètre (l’adresse du créateur)', async () => {
    expect(await perimetreDuGeste({ occupationIds: [5000] })).toEqual({ ok: true, perimetre: { testId: 3, createurEmail: 'a.jorel@sansvisavis.com' } });
  });
  it('🔴 un test MÊLÉ à de vrais locataires ou biens : refus', async () => {
    expect((await perimetreDuGeste({ occupationIds: [5000, 11] })).ok).toBe(false);
    expect((await perimetreDuGeste({ occupationIds: [5000], lotIds: [7] })).ok).toBe(false);
  });
  it('un test supprimé (masqué) garde son périmètre : il n’envoie toujours rien ailleurs', async () => {
    tests[0].supprime_le = '2026-11-14';
    expect(await perimetreDuGeste({ lotIds: [900] })).toMatchObject({ ok: true, perimetre: { testId: 3 } });
  });
});

describe('sqlHorsTest', () => {
  it('exclut les biens des préavis de test (masqués compris)', async () => {
    expect(await sqlHorsTest('o.lot_id')).toBe('NOT EXISTS (SELECT 1 FROM gestion_location_preavis_test t__ WHERE t__.lot_id = o.lot_id)');
  });
});

describe('preavisEnCours — qui voit les préavis de test', () => {
  it('par défaut (compteurs, Gestion, alertes J+10) : aucun ; le visiteur : les SIENS ; l’invitation : tous les actifs', async () => {
    const { preavisEnCours } = await import('./preavisRepo');
    const sqlDe = async (o?: Parameters<typeof preavisEnCours>[0]) => {
      appels.length = 0;
      await preavisEnCours(o).catch(() => null);
      return appels.find((a) => a.sql.includes('FROM gestion_location_preavis p'));
    };
    const defaut = (await sqlDe())!;
    expect(defaut.sql).toContain('LEFT JOIN gestion_location_preavis_test t ON t.lot_id = o.lot_id');
    expect(defaut.sql).toContain('AND t.id IS NULL');
    expect(defaut.params).toEqual([]);
    const moi = (await sqlDe({ tests: { visiteur: 1 } }))!;
    expect(moi.sql).toContain('t.supprime_le IS NULL AND t.createur_id = $1');
    expect(moi.params).toEqual([1]);
    expect((await sqlDe({ tests: 'tous' }))!.sql).toContain('(t.id IS NULL OR t.supprime_le IS NULL)');
    expect((await sqlDe({ tests: { visiteur: null } }))!.sql).toContain('AND t.id IS NULL');
  });
});
