import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * PROJ-CTX — `lireVoisinageContexte` : contexte (parcelles voisines + bâti dans le rayon). On vérifie le COMPORTEMENT + les FRAGMENTS
 * SQL sémantiques (jamais la forme exacte) : rayon 0 → aucune requête ; exclusions anti-doublon (bâti déjà affiché ∩ empreinte,
 * parcelle du permis) ; ST_DWithin (index), jamais un KNN ; mapping des lignes → ObjetContexte. `db/client` mocké (capture SQL + params).
 */
const H = vi.hoisted(() => {
  const calls: { sql: string; params: unknown[] }[] = [];
  const state = { rows: [] as unknown[] };
  const queryMock = async (sql: string, params?: unknown[]) => { calls.push({ sql, params: params ?? [] }); return { rows: state.rows, rowCount: state.rows.length }; };
  return { calls, state, queryMock };
});
vi.mock('../db/client', () => ({ query: H.queryMock, withTransaction: async (fn: (q: unknown) => unknown) => fn(H.queryMock) }));

import { lireVoisinageContexte } from './empriseReconstruiteRepo';

const norm = (s: string) => s.replace(/\s+/g, ' ');

describe('lireVoisinageContexte — contexte, anti-doublon (PROJ-CTX)', () => {
  beforeEach(() => { H.calls.length = 0; H.state.rows = []; });

  it('rayon 0 (ou invalide) → aucun contexte, AUCUNE requête émise', async () => {
    expect(await lireVoisinageContexte(468, 0)).toEqual([]);
    expect(await lireVoisinageContexte(468, -5)).toEqual([]);
    expect(H.calls.length).toBe(0);
  });

  it('(d) la requête EXCLUT le bâti déjà affiché (∩ empreinte) et la parcelle du permis → aucun doublon ; ST_DWithin (index), jamais KNN', async () => {
    await lireVoisinageContexte(468, 50);
    expect(H.calls.length).toBe(1);
    const sql = norm(H.calls[0].sql);
    expect(sql).toContain('ST_DWithin(par.geom, emp.geom, $2)');
    expect(sql).toContain('ST_DWithin(b.geom, emp.geom, $2)');
    expect(sql).toContain('NOT (b.geom && emp.geom AND ST_Intersects(b.geom, emp.geom))'); // bâti sur/mitoyen déjà affiché → exclu
    expect(sql).toContain('ST_Area(ST_Intersection(ST_Force2D(par.geom), emp.geom)) < 1'); // parcelle(s) du permis → exclue(s)
    expect(sql).not.toContain('<->');                        // jamais un KNN
    expect(H.calls[0].params).toEqual([468, 50]);            // dossier + rayon LIÉS (le rayon vient de l'appelant, pas en dur)
  });

  it('mappe les lignes → ObjetContexte (parcelle / batiment ; Polygon & MultiPolygon éclatés en anneaux)', async () => {
    H.state.rows = [
      { genre: 'parcelle', gj: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } },
      { genre: 'batiment', gj: { type: 'MultiPolygon', coordinates: [[[[2, 2], [3, 2], [3, 3], [2, 2]]], [[[5, 5], [6, 5], [6, 6], [5, 5]]]] } },
    ];
    const r = await lireVoisinageContexte(468, 50);
    expect(r.map((o) => o.genre)).toEqual(['parcelle', 'batiment', 'batiment']); // le MultiPolygon (2 parties) → 2 objets
    expect(r[0].anneau[0]).toEqual({ x: 0, y: 0 });
  });
});
