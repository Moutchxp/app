import { describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (22/10/2026) — la mesure de nature d'un faisceau découpe le rayon de la fenêtre jusqu'à SA borne (le premier obstacle
 * bloquant, ou la portée) et rien au-delà : un espace vert derrière l'obstacle n'entre pas dans `natureTraverseeM`.
 */
const appels: { sql: string; params: unknown[] }[] = [];
vi.mock('./client', () => ({ query: vi.fn(async (sql: string, params: unknown[]) => { appels.push({ sql, params }); return { rows: [] }; }) }));
const { natureTraverseeParFaisceau } = await import('./obstacles');

describe('🔴 mesure de nature bornée au premier obstacle', () => {
  it('chaque rayon est coupé à sa borne : ST_LineSubstring(rayon, 0, min(borne, portée) / portée)', async () => {
    await natureTraverseeParFaisceau({ lat: 48.9, lon: 2.26 }, [0, 3], [80, 200]);
    const sql = appels[0].sql.replace(/\s+/g, ' ');
    expect(sql).toContain('ST_LineSubstring(');
    expect(sql).toContain('0, LEAST(f.borne, $5) / $5::float8');
    expect(sql).toContain('ST_Length(ST_Intersection(seg.s, nat.g))');
    expect(appels[0].params[3]).toEqual([80, 200]);
  });
});
