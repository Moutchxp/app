import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 LOT P (décision d'Arno du 22/10/2026) — l'éventail du SCORE pivote face à la façade en mode « Façade (snap) ».
 * Base simulée : validation, obstacles et faisceaux sont des doublures ; la géométrie du mur et l'analyse sont les vraies.
 */
const appelsFaisceaux: number[] = [];
vi.mock('./origine', () => ({
  validerOrigine: vi.fn(async (_p: unknown, mode: string) => ({
    valide: true, raison: mode, dansBatiment: true, distanceAuBatimentM: 0, altSolBdTopoM: 40,
    // Immeuble rectangulaire 20 × 10 m ; point snappé sur la façade OUEST (normale extérieure 270°).
    batimentOrigine: { id: 1, cleabs: 'PROPRE', polygoneWkt: 'POLYGON((0 0,20 0,20 10,0 10,0 0))' },
    altitudeTerrainOrigineM: 40, pointSnappeL93: { x: 0, y: 5 }, pointSnappeWgs84: { lat: 48.9, lon: 2.26 },
  })),
}));
vi.mock('./obstacles', () => ({
  obstaclesSurAxe: vi.fn(async () => [{ distanceM: 55, altitudeSommetM: 70, source: 'LIDAR_HD' }]),
  resoudreVueNature: vi.fn(async () => ({ verdureM: 12, planEauM: 0, coursEauM: 0, nomVerdure: 'Square', nomPlanEau: null })),
  resoudreEpoqueImmobilier: vi.fn(async () => ({ nCone: 41, faisceaux: Array.from({ length: 41 }, () => ({ annee: 1930, touche: true })) })),
  resoudreMonuments: vi.fn(async () => ({ faisceaux: [] })),
}));
// Les faisceaux : la distance dépend de l'AZIMUT ABSOLU du rayon — derrière la façade (vers l'Est, dans l'immeuble),
// l'ancien éventail « voyait » à 150 m ; devant, 30 m. Un éventail mal centré se voit donc au score.
vi.mock('./faisceaux', () => ({
  faisceauxAmplitude: vi.fn(async (p: { azimutPrincipalDeg: number }) => {
    appelsFaisceaux.push(p.azimutPrincipalDeg);
    return Array.from({ length: 61 }, (_, i) => {
      const offsetDeg = -90 + 3 * i;
      const az = (((p.azimutPrincipalDeg + offsetDeg) % 360) + 360) % 360;
      const derriere = Math.abs(((az - 270 + 540) % 360) - 180) > 90;
      return { offsetDeg, distanceObstacleM: derriere ? 150 : 30, natureTraverseeM: 0, impactCleabs: null, impactEmblematique: false };
    });
  }),
}));
vi.mock('../svv/preparateurPaysage', () => ({ preparerPaysageGeometrique: vi.fn(async () => ({ faisceauxValorisants: 0, faisceauxConeTotal: 0 })) }));

const { construireEntree } = await import('./pipeline');
const { analyser } = await import('../svv/analyse');
const { PROFIL_DEGAGEMENT_DEFAUT } = await import('../svv/profilDegagement');
const P = { point: { lat: 48.9, lon: 2.26 }, etage: 3, dernierEtage: false } as const;

beforeEach(() => { appelsFaisceaux.length = 0; });

describe('🔴 mode Façade : l’éventail du score est centré sur la normale du mur', () => {
  it('azimut choisi 300°, façade normale 270° : deux éventails, le score sur celui de la façade', async () => {
    const { entree } = await construireEntree({ ...P, azimutPrincipalDeg: 300, mode: 'semi_auto' });
    expect(appelsFaisceaux).toEqual([300, 270]);
    expect(entree!.pivot).toEqual({ azimutNormaleDeg: 270, azimutChoisiDeg: 300, ecartDeg: 30 });
    // Plus aucun faisceau du score derrière le mur (ici : plus aucun à 150 m).
    expect(entree!.faisceauxScore!.filter((f) => f.distanceObstacleM === 150)).toHaveLength(0);
    expect(entree!.faisceaux.filter((f) => f.distanceObstacleM === 150)).toHaveLength(10);
    const r = analyser(entree!, PROFIL_DEGAGEMENT_DEFAUT);
    expect(r.pivot).toEqual(entree!.pivot);
  });

  it('verdict et cartouches identiques avant / après ; seul le score change', async () => {
    const { entree } = await construireEntree({ ...P, azimutPrincipalDeg: 300, mode: 'semi_auto' });
    const apres = analyser(entree!, PROFIL_DEGAGEMENT_DEFAUT, { ventilation: true });
    const avantEntree = { ...entree!, faisceauxScore: undefined, pivot: undefined };
    const avant = analyser(avantEntree, PROFIL_DEGAGEMENT_DEFAUT, { ventilation: true });
    expect(apres.verdict).toEqual(avant.verdict);
    expect(apres.distanceAxePrincipalM).toEqual(avant.distanceAxePrincipalM);
    expect(apres.contexteDegagement).toBe(avant.contexteDegagement);
    expect(apres.contexteVueNature).toBe(avant.contexteVueNature);
    expect(apres.contexteImmobilier).toBe(avant.contexteImmobilier);
    expect(apres.monumentsHistoriques).toEqual(avant.monumentsHistoriques);
    expect(apres.score.famille1).toEqual(avant.score.famille1);          // Résultat A : sur l'azimut choisi
    expect(apres.score.total).toBeLessThan(avant.score.total);          // les vues « à travers l'immeuble » ne comptent plus
    expect(apres.ventilation!.lignes.map((l) => l.distanceBruteM)).toEqual(entree!.faisceauxScore!.map((f) => f.distanceObstacleM));
  });
});

describe('🔴 mode Libre : rien ne change', () => {
  it('un seul éventail, sur l’azimut ; score strictement identique au calcul d’avant', async () => {
    const { entree } = await construireEntree({ ...P, azimutPrincipalDeg: 300, mode: 'manuel' });
    expect(appelsFaisceaux).toEqual([300]);
    expect(entree!.faisceauxScore).toBeUndefined();
    expect(entree!.pivot).toBeUndefined();
    const r = analyser(entree!, PROFIL_DEGAGEMENT_DEFAUT);
    expect(r.pivot).toBeUndefined();
    expect(Object.is(r.score.total, analyser({ ...entree! }, PROFIL_DEGAGEMENT_DEFAUT).score.total)).toBe(true);
  });
});

describe('🔴 P6 — azimut stocké −27°', () => {
  it('est traité comme 333° (éventail, orientation, pivot)', async () => {
    const { entree } = await construireEntree({ ...P, azimutPrincipalDeg: -27, mode: 'semi_auto' });
    expect(appelsFaisceaux[0]).toBe(333);
    expect(entree!.orientationAzimutDeg).toBe(333);
    expect(entree!.pivot!.azimutChoisiDeg).toBe(333);
  });
});
