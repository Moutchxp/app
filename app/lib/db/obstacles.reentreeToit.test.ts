/**
 * 🔴 A′ — DÉCISION D'ARNO DU 22/10/2026 : une ré-entrée dans le propre bâtiment ne bloque que si le toit LiDAR, le long du
 * rayon dans cette ré-entrée, atteint l'œil ; distance = bord BD TOPO inchangée ; sans LiDAR, comportement d'avant.
 * Base simulée : la 1re requête rend la ré-entrée (comme la vraie), les suivantes rendent le toit LiDAR de chaque tronçon.
 * Le cas réel (19 rue Louis Ulbach) est éprouvé sur base par `reentreeToitLidar.itest.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const reponses: unknown[][] = [];
const appels: { sql: string; params: unknown[] }[] = [];
vi.mock('./client', () => ({
  query: vi.fn(async (sql: string, params: unknown[]) => { appels.push({ sql, params }); return { rows: reponses.shift() ?? [] }; }),
}));
const { candidatReentreeOrigine } = await import('./obstacles');

const REENTREE = {
  dist_m: 8.5, amt: null, h: 25.4, sol: 44.7, net: null, cleabs: 'PROPRE', impact_pt_wkt: 'POINT(1 1)', axe_wkt: 'LINESTRING(0 0,1 1)',
  mns_toit: null, fin_m: 20, suivants: [[30, 45]],
};
const toit = (atteint: boolean, lidar: boolean, impact = 'POINT(2 2)') => [{ atteint, lidar, impact_pt_wkt: impact }];
const PARAMS = { point: { lat: 48.9, lon: 2.26 }, azimutDeg: 169, batimentOrigineId: 1, batimentOriginePolygoneWkt: 'POLYGON((0 0,1 0,1 1,0 0))' };
const OEIL = 56.8;

beforeEach(() => { reponses.length = 0; appels.length = 0; });

describe('🔴 A′ — la ré-entrée dans le propre bâtiment, jugée sur son toit LiDAR', () => {
  it('sans œil (diagnostic) : comportement d’avant, une seule requête', async () => {
    reponses.push([REENTREE]);
    expect(await candidatReentreeOrigine(PARAMS)).toMatchObject({ distanceM: 8.5, altitudeSommetM: 70.1, source: 'BD_TOPO', cleabs: 'PROPRE', impactPointWkt: 'POINT(1 1)' });
    expect(appels).toHaveLength(1);
  });

  it('toit LiDAR qui atteint l’œil : bloque, MÊME distance (bord BD TOPO) et même hauteur qu’avant', async () => {
    reponses.push([REENTREE], toit(true, true));
    expect(await candidatReentreeOrigine({ ...PARAMS, altitudeFenetreM: OEIL })).toMatchObject({ distanceM: 8.5, altitudeSommetM: 70.1, impactPointWkt: 'POINT(1 1)' });
    // Le tronçon jugé : de la ré-entrée à la fin de son span réel ; l'œil est passé tel quel.
    expect(appels[1].params.slice(4, 7)).toEqual([8.5, 20, OEIL]);
  });

  it('sans LiDAR sur le tronçon : bloque comme avant', async () => {
    reponses.push([REENTREE], toit(false, false));
    expect(await candidatReentreeOrigine({ ...PARAMS, altitudeFenetreM: OEIL })).toMatchObject({ distanceM: 8.5, altitudeSommetM: 70.1 });
  });

  it('aile basse (LiDAR sous l’œil) : franchie ; la ré-entrée suivante qui atteint l’œil bloque à SON bord', async () => {
    reponses.push([REENTREE], toit(false, true), toit(true, true, 'POINT(3 3)'));
    expect(await candidatReentreeOrigine({ ...PARAMS, altitudeFenetreM: OEIL })).toMatchObject({ distanceM: 30, altitudeSommetM: 70.1, impactPointWkt: 'POINT(3 3)' });
    expect(appels[2].params.slice(4, 6)).toEqual([30, 45]);
  });

  it('toutes les ré-entrées sous l’œil : plus aucun candidat du propre bâtiment', async () => {
    reponses.push([REENTREE], toit(false, true), toit(false, true));
    expect(await candidatReentreeOrigine({ ...PARAMS, altitudeFenetreM: OEIL })).toBeNull();
  });

  it('aucune ré-entrée : rien à juger', async () => {
    reponses.push([]);
    expect(await candidatReentreeOrigine({ ...PARAMS, altitudeFenetreM: OEIL })).toBeNull();
    expect(appels).toHaveLength(1);
  });
});
