import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * RATT-EDIT (lot B3) — marqueursModifApresValidation : dérive « modifié après validation, à revalider » + la trace, SANS migration.
 * `db/client` mocké → on éprouve le MAPPING (Map, conversion ISO, trace null honnête, résilience) + les FRAGMENTS sémantiques du SQL
 * (comparaison à la dernière version de gel + repli projection/valide_le + ST_Equals pour capter la retouche). La correction de bout en
 * bout sur données réelles est prouvée au navigateur (parcours B3) — le figeage étant append-only, on n'écrit pas de gel en test.
 */
const H = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], lastSql: '', lastParams: [] as unknown[], throws: false }));
vi.mock('../db/client', () => ({
  query: async (sql: string, params?: unknown[]) => {
    if (H.throws) throw Object.assign(new Error('undefined table'), { code: '42P01' });
    H.lastSql = sql; H.lastParams = params ?? []; return { rows: H.rows };
  },
}));

import { marqueursModifApresValidation } from './modificationApresValidation';

beforeEach(() => { H.rows = []; H.lastSql = ''; H.lastParams = []; H.throws = false; });

describe('marqueursModifApresValidation — dérive marqueur + trace (zéro migration)', () => {
  it('liste vide → Map vide, AUCUNE requête émise', async () => {
    const m = await marqueursModifApresValidation([]);
    expect(m.size).toBe(0);
    expect(H.lastSql).toBe('');
  });

  it('mappe dossier → { le (ISO), parNom } ; un dossier absent des lignes = NON modifié', async () => {
    H.rows = [{ dossier_id: '531', le: new Date('2026-09-20T20:22:22Z'), par_nom: 'Arnaud Jorel' }];
    const m = await marqueursModifApresValidation([531, 7424]);
    expect(m.get(531)).toEqual({ le: '2026-09-20T20:22:22.000Z', parNom: 'Arnaud Jorel' });
    expect(m.has(7424)).toBe(false);
    // ids liés (jamais interpolés), dédupliqués/validés
    expect(H.lastParams).toEqual([[531, 7424]]);
  });

  it('la RÉFÉRENCE = COALESCE(gel de validation, projection.validee_le, valide_le) et capte la RETOUCHE (ST_Equals)', async () => {
    H.rows = [];
    await marqueursModifApresValidation([531]);
    const sql = H.lastSql.replace(/\s+/g, ' ');
    expect(sql).toContain("gele_par LIKE 'validation:%'"); // dernière version de gel de VALIDATION
    expect(sql).toContain('pp.validee_le');                // repli : passage en Rattachement (permis validés AVANT B1)
    expect(sql).toContain('r.valide_le');                  // repli ultime
    expect(sql).toContain('cb.maj_le > ref.ref_le');       // corps modifié après la référence
    expect(sql).toContain('ST_Equals');                    // emprise : compare la géométrie au gel → capte la retouche
  });

  it('modification d’EMPRISE seule (le/par_nom null) → marqueur PRÉSENT, trace null (honnête, jamais faux)', async () => {
    H.rows = [{ dossier_id: 999, le: null, par_nom: null }];
    const m = await marqueursModifApresValidation([999]);
    expect(m.get(999)).toEqual({ le: null, parNom: null });
  });

  it('erreur base (tables de gel absentes) → Map vide (résilient, jamais une liste cassée)', async () => {
    H.throws = true;
    const m = await marqueursModifApresValidation([1]);
    expect(m.size).toBe(0);
  });
});
