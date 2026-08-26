import { describe, it, expect, vi, beforeEach } from 'vitest';

const H = vi.hoisted(() => ({ q: vi.fn() }));
vi.mock('./client', () => ({ query: H.q }));

import { cleabsObstacleAxe } from './obstacleIdentite';
import { CORRIDOR_HALF_WIDTH_M } from '../svv/config';

const AXE = { point: { lat: 48.90693182287072, lon: 2.269431435588249 }, azimutDeg: 90 };

describe('AUDIT démolitions — cleabsObstacleAxe (lecture seule, best-effort)', () => {
  beforeEach(() => H.q.mockReset());

  it('un bâti est trouvé → renvoie son cleabs ; interroge bdtopo_batiment avec [lon, lat, dist, azimut, demi-couloir]', async () => {
    H.q.mockResolvedValue({ rows: [{ cleabs: 'BATIMENT0000000240276596' }] });
    const r = await cleabsObstacleAxe(AXE, 42.1);
    expect(r).toBe('BATIMENT0000000240276596');
    expect(H.q).toHaveBeenCalledTimes(1);
    const [sql, params] = H.q.mock.calls[0];
    expect(sql).toMatch(/FROM bdtopo_batiment/);
    expect(sql).not.toMatch(/permis_emprise_reconstruite/); // lit le bâti RÉEL, jamais l'emprise projetée
    expect(params).toEqual([AXE.point.lon, AXE.point.lat, 42.1, AXE.azimutDeg, CORRIDOR_HALF_WIDTH_M]);
  });

  it('aucun bâti identifiable (0 ligne) → null (absence explicite)', async () => {
    H.q.mockResolvedValue({ rows: [] });
    expect(await cleabsObstacleAxe(AXE, 42.1)).toBeNull();
  });

  it('distance nulle / négative / non finie (sentinelle INDÉTERMINÉ, etc.) → null SANS aucune requête', async () => {
    for (const d of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(await cleabsObstacleAxe(AXE, d)).toBeNull();
    }
    expect(H.q).not.toHaveBeenCalled();
  });

  it('erreur base → null (best-effort : n’explose jamais, ne bloque pas l’émission)', async () => {
    H.q.mockImplementation(async (sql: string) => { if (/bdtopo_batiment/.test(sql)) throw new Error('PostGIS indisponible'); return { rows: [] }; });
    await expect(cleabsObstacleAxe(AXE, 42.1)).resolves.toBeNull();
  });
});
