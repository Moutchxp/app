import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (22/10/2026) — un faisceau n'est « nature » que s'il survole un espace vert ENTRE la fenêtre et son PREMIER OBSTACLE
 * BLOQUANT (sommet ≥ œil). Un espace vert derrière cet obstacle ne compte pas et ne débride rien.
 * La mesure (`natureTraverseeParFaisceau`) reçoit, par faisceau, la borne min(distance du 1er obstacle bloquant, portée) ;
 * base simulée : on vérifie la borne transmise et ce que compte ensuite le faisceau.
 */
const bornesRecues: number[][] = [];
vi.mock('./client', () => ({ query: vi.fn(async () => ({ rows: [] })) }));
vi.mock('./toleranceReentree', () => ({ lireToleranceContactReentree: vi.fn(async () => 0.01) }));
vi.mock('./obstacles', () => ({
  // Rayon d'azimut 0 : un bâtiment BAS à 40 m (sous l'œil, ne bloque pas) puis un bâtiment à 80 m qui bloque ;
  // le parc est juste derrière, à 85–150 m. Les autres rayons : dégagés.
  obstaclesSurAxe: vi.fn(async ({ azimutDeg }: { azimutDeg: number }) => (azimutDeg === 0
    ? [{ distanceM: 40, altitudeSommetM: 50, source: 'BD_TOPO' }, { distanceM: 80, altitudeSommetM: 70, source: 'BD_TOPO', cleabs: 'B80' }]
    : [])),
  // La « vraie » géométrie du parc : 85 → 150 m sur le rayon d'azimut 0. On ne mesure que jusqu'à la borne reçue.
  natureTraverseeParFaisceau: vi.fn(async (_p: unknown, azimuts: number[], bornes: number[]) => {
    bornesRecues.push(bornes);
    return azimuts.map((az, i) => (az === 0 ? Math.max(0, Math.min(bornes[i], 150) - 85) : 0));
  }),
}));
const { faisceauxAmplitude } = await import('./faisceaux');
const { distancePercueFaisceau, ventilerFaisceau } = await import('../svv/coucheDegagement');
const { PROFIL_DEGAGEMENT_DEFAUT } = await import('../svv/profilDegagement');

beforeEach(() => { bornesRecues.length = 0; });

describe('🔴 la nature n’est mesurée qu’entre la fenêtre et le premier obstacle bloquant', () => {
  it('bâtiment bloquant à 80 m, parc juste derrière : borne 80, nature 0 → faisceau ORDINAIRE, compté 80, plafond 200, aucun boost', async () => {
    const fs = await faisceauxAmplitude({ point: { lat: 48.9, lon: 2.26 }, azimutPrincipalDeg: 0, batimentOrigineId: 1, altitudeFenetreM: 60 });
    const i = fs.findIndex((f) => f.offsetDeg === 0);
    expect(fs[i].distanceObstacleM).toBe(80);                  // le bâtiment bas à 40 m ne bloque pas : l'obstacle retenu est à 80 m
    expect(bornesRecues[0][i]).toBe(80);                         // la mesure de nature s'arrête au premier obstacle BLOQUANT
    expect(bornesRecues[0].filter((b, k) => k !== i).every((b) => b === 200)).toBe(true);   // dégagés : jusqu'à la portée
    expect(fs[i].natureTraverseeM).toBe(0);                     // le parc derrière le bâtiment n'est pas compté
    for (const plafond of [200, 300, 500]) {
      const p = { ...PROFIL_DEGAGEMENT_DEFAUT, distanceMaxM: plafond };
      expect(distancePercueFaisceau(fs[i], p)).toBe(80);
      const v = ventilerFaisceau(fs[i], p);
      expect(v.typeFaisceau).toBe('ordinaire');
      expect(v.seuilBorneM).toBe(200);
      expect(v.boostF4AppliqueM).toBe(0);
    }
  });
});
