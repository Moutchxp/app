/**
 * Test d'intégration (vraie connexion PostGIS, LECTURE SEULE) — option A d'Arno du 14/10/2026 : le propre bâtiment bouche un
 * faisceau LÀ OÙ il y entre réellement ; le contact RASANT le long de son mur ne compte jamais.
 *
 *   ① Asnières, faisceau 45° (offset -45°) : l'origine est un sommet du polygone, le faisceau longe une arête sur 0,99 m puis
 *     entre dans le bâtiment. Origine perturbée dans les 7 variantes (exacte, ±1e-9, ±1e-6 m) → MÊME classification ;
 *   ② même chose sur les 61 faisceaux et le SCORE complet (profil gelé du golden) ;
 *   ③ non-régression : aile en L et cour intérieure → la réentrée réelle est toujours détectée ;
 *   ④ le verdict d'Asnières est inchangé.
 * Aucune écriture : SELECT seulement (validerOrigine, obstacles, faisceaux). Lancé par `npm run test:integration`.
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { closePool, query } from './client';
import { validerOrigine, type ValidationOrigine } from './origine';
import { candidatReentreeOrigine, obstaclesSurAxe } from './obstacles';
import { faisceauxAmplitude } from './faisceaux';
import { construireEntree } from './pipeline';
import { analyser, type EntreeComplete } from '../svv/analyse';
import type { ProfilDegagement } from '../svv/profilDegagement';
import { CAS_GOLDEN, PROFIL_GOLDEN_DIAG } from '../diag/diagGolden';

const PROFIL = PROFIL_GOLDEN_DIAG as unknown as ProfilDegagement;
const PERTURBATIONS: readonly [string, number, number][] = [
  ['exacte', 0, 0], ['+1e-9 y', 0, 1e-9], ['-1e-9 y', 0, -1e-9], ['+1e-6 x', 1e-6, 0], ['-1e-6 x', -1e-6, 0], ['+1e-6 y', 0, 1e-6], ['-1e-6 y', 0, -1e-6],
];

/** Un point Lambert-93 rendu en WGS84 par PostGIS (même chaîne que l'application, qui reprojette à l'entrée). */
async function versWgs84(x: number, y: number): Promise<{ lat: number; lon: number }> {
  const { rows } = await query<{ lon: number; lat: number }>(
    `SELECT ST_X(g) AS lon, ST_Y(g) AS lat FROM (SELECT ST_Transform(ST_SetSRID(ST_MakePoint($1, $2), 2154), 4326) AS g) t`, [x, y]);
  return { lon: rows[0].lon, lat: rows[0].lat };
}

let validation: ValidationOrigine;
let origine: { x: number; y: number };
beforeAll(async () => {
  validation = await validerOrigine({ ...CAS_GOLDEN.point }, 'semi_auto');
  expect(validation.valide).toBe(true);
  const { rows } = await query<{ x: number; y: number }>(
    `SELECT ST_X(g) AS x, ST_Y(g) AS y FROM (SELECT ST_Transform(ST_SetSRID(ST_MakePoint($1, $2), 4326), 2154) AS g) t`,
    [validation.pointSnappeWgs84!.lon, validation.pointSnappeWgs84!.lat]);
  origine = rows[0];
});
afterAll(async () => { await closePool(); });

describe('① Asnières, faisceau 45° — même classification sous perturbation de l’origine', () => {
  it('7 variantes : réentrée dans le propre bâtiment toujours trouvée, à la distance RÉELLE 0,98995 m (sommet où le faisceau quitte le mur)', async () => {
    expect(origine.x).toBeCloseTo(646451.7, 6);
    expect(origine.y).toBeCloseTo(6867683.6, 6);
    const distances: number[] = [];
    for (const [nom, dx, dy] of PERTURBATIONS) {
      const r = await candidatReentreeOrigine({
        point: await versWgs84(origine.x + dx, origine.y + dy), azimutDeg: 45,
        batimentOrigineId: validation.batimentOrigine!.id, batimentOriginePolygoneWkt: validation.batimentOrigine!.polygoneWkt,
      });
      expect(r, nom).not.toBeNull();
      expect(r!.cleabs, nom).toBe('BATIMENT0000000240319856');
      expect(r!.distanceM, nom).toBeCloseTo(0.98995, 5); // 0,7·√2 : le sommet (646452,4 ; 6867684,3), polygone RÉEL
      distances.push(r!.distanceM);
    }
    expect(Math.max(...distances) - Math.min(...distances)).toBeLessThan(1e-5);
  });
});

describe('② Asnières — 61 faisceaux et score complet stables sous perturbation de l’origine', () => {
  // Le faisceau -90° (plein nord) frôle le bord du couloir sur un mur du VOISIN …053 (à exactement 1 m du rayon). Depuis la
  // règle A étendue aux voisins (14/10/2026), ce frôlement n'est plus un contact : les 7 variantes sont toutes comparées.
  it('7 variantes : mêmes 61 faisceaux (dégagé / bouché, bâtiment heurté), score identique à 1e-6 près', async () => {
    const { entree } = await construireEntree({ ...CAS_GOLDEN, point: { ...CAS_GOLDEN.point } });
    expect(entree).not.toBeNull();
    const classements: string[] = [];
    const proprePartout: string[] = [];
    const scores: number[] = [];
    for (const [nom, dx, dy] of PERTURBATIONS) {
      const faisceaux = await faisceauxAmplitude({
        point: await versWgs84(origine.x + dx, origine.y + dy), azimutPrincipalDeg: CAS_GOLDEN.azimutPrincipalDeg,
        batimentOrigineId: validation.batimentOrigine!.id, batimentOriginePolygoneWkt: validation.batimentOrigine!.polygoneWkt,
        altitudeFenetreM: entree!.altitudeFenetreM,
      });
      proprePartout.push(JSON.stringify(faisceaux.filter((f) => f.impactCleabs === 'BATIMENT0000000240319856').map((f) => f.offsetDeg)));
      expect(nom).toBeTruthy();
      classements.push(JSON.stringify(faisceaux.map((f) => [f.offsetDeg, f.distanceObstacleM === null, f.impactCleabs])));
      scores.push(analyser({ ...(entree as EntreeComplete), faisceaux }, PROFIL).score.total);
    }
    for (const c of proprePartout) expect(c).toBe(proprePartout[0]);
    expect(classements).toHaveLength(7);
    for (const c of classements) expect(c).toBe(classements[0]);
    expect(classements[0]).toContain('[-90,false,"BATIMENT0000000240320054"]'); // le voisin frôlé …053 n'est jamais retenu
    expect(Math.max(...scores) - Math.min(...scores)).toBeLessThan(1e-6);
    // Le faisceau 45° est bouché par le propre bâtiment dans toutes les variantes.
    expect(classements[0]).toContain('[-45,false,"BATIMENT0000000240319856"]');
  }, 180_000);
});

describe('③ non-régression — une réentrée RÉELLE dans le propre bâtiment est toujours détectée', () => {
  // Géométries synthétiques en Lambert-93 (décalées dans Asnières) ; hauteurs lues sur le bâtiment 244601.
  const X0 = 646000, Y0 = 6867000;
  const pt = (x: number, y: number) => `${X0 + x} ${Y0 + y}`;

  it('aile en L : depuis la façade intérieure d’une aile, le faisceau 45° heurte l’autre aile', async () => {
    // Aile verticale x∈[0,10] y∈[0,30], aile horizontale x∈[10,30] y∈[20,30] ; origine sur la façade x=10, y=5.
    const L = `POLYGON((${pt(0, 0)},${pt(10, 0)},${pt(10, 20)},${pt(30, 20)},${pt(30, 30)},${pt(0, 30)},${pt(0, 0)}))`;
    // Origine SUR la façade (x=10) ou 0,2 m dedans (x=9,8) : même déplacement vertical jusqu'à l'aile heurtée (y=20).
    for (const [ox, attendu] of [[10, 15 * Math.SQRT2], [9.8, 15 * Math.SQRT2]] as const) {
      const r = await candidatReentreeOrigine({ point: await versWgs84(X0 + ox, Y0 + 5), azimutDeg: 45, batimentOrigineId: 244601, batimentOriginePolygoneWkt: L });
      expect(r, `origine x=${ox}`).not.toBeNull();
      // L'aile heurtée commence à y=20 : distance mesurée sur le polygone RÉEL (le rétréci ne sert qu'à classer).
      expect(r!.distanceM).toBeCloseTo(attendu, 6);
    }
  });

  it('cour intérieure : depuis la façade sur cour, le faisceau traverse la cour et heurte la façade opposée', async () => {
    // Bâtiment 40×40 avec cour 20×20 au centre ; origine sur la façade ouest de la cour (x=10, y=20), faisceau plein est.
    const cour = `POLYGON((${pt(0, 0)},${pt(40, 0)},${pt(40, 40)},${pt(0, 40)},${pt(0, 0)}),(${pt(10, 10)},${pt(10, 30)},${pt(30, 30)},${pt(30, 10)},${pt(10, 10)}))`;
    const r = await candidatReentreeOrigine({ point: await versWgs84(X0 + 10, Y0 + 20), azimutDeg: 90, batimentOrigineId: 244601, batimentOriginePolygoneWkt: cour });
    expect(r).not.toBeNull();
    expect(r!.distanceM).toBeCloseTo(20, 6); // façade opposée x=30, polygone RÉEL
  });

  it('un faisceau qui part VERS L’EXTÉRIEUR depuis la façade : aucune réentrée (comportement inchangé)', async () => {
    const L = `POLYGON((${pt(0, 0)},${pt(10, 0)},${pt(10, 20)},${pt(30, 20)},${pt(30, 30)},${pt(0, 30)},${pt(0, 0)}))`;
    const r = await candidatReentreeOrigine({ point: await versWgs84(X0 + 10, Y0 + 5), azimutDeg: 135, batimentOrigineId: 244601, batimentOriginePolygoneWkt: L });
    expect(r).toBeNull();
  });
});

describe('⑤ voisins — un frôlement n’est pas un contact (règle A étendue, 14/10/2026)', () => {
  const faisceau = async (dx: number, dy: number, azimutDeg: number) => obstaclesSurAxe({
    point: await versWgs84(origine.x + dx, origine.y + dy), azimutDeg,
    batimentOrigineId: validation.batimentOrigine!.id, batimentOriginePolygoneWkt: validation.batimentOrigine!.polygoneWkt,
  });

  it('…053, façade parallèle frôlée (à 1 m du rayon, bord du couloir) : jamais retenue, dans les 7 variantes ; premier obstacle …054 à 120,004 m', async () => {
    for (const [nom, dx, dy] of PERTURBATIONS) {
      const c = await faisceau(dx, dy, 0);
      expect(c.map((o) => o.cleabs), nom).not.toContain('BATIMENT0000000240320053');
      expect(c[0].cleabs, nom).toBe('BATIMENT0000000240320054');
      expect(c[0].distanceM, nom).toBeCloseTo(120.00416659433121, 5); // distance sur l'emprise RÉELLE
    }
  });

  it('mur réellement en face (le rayon le traverse) : toujours détecté — …054 sur le faisceau plein nord, …854 à 135°', async () => {
    expect((await faisceau(0, 0, 0)).some((o) => o.cleabs === 'BATIMENT0000000240320054')).toBe(true);
    const c = await faisceau(0, 0, 135);
    expect(c.some((o) => o.cleabs === 'BATIMENT0000000240319854' && Math.abs(o.distanceM - 8.260713323240086) < 1e-9)).toBe(true);
  });

  it('coin qui entre de plus de 1 cm dans le couloir (…41399570, 1,44 cm à 123°) : toujours détecté, dans les 7 variantes', async () => {
    for (const [nom, dx, dy] of PERTURBATIONS) {
      expect((await faisceau(dx, dy, 123)).some((o) => o.cleabs === 'BATIMENT0000000241399570'), nom).toBe(true);
    }
  });
});

describe('④ le verdict d’Asnières est inchangé (chemin LiDAR, non concerné par la réentrée)', () => {
  it('SANS_VIS_A_VIS à 42,100339602923526 m, premier obstacle LiDAR', async () => {
    const { entree } = await construireEntree({ ...CAS_GOLDEN, point: { ...CAS_GOLDEN.point } });
    const r = analyser(entree!, PROFIL);
    expect(r.verdict.verdict).toBe('SANS_VIS_A_VIS');
    expect(r.verdict.distanceM).toBeCloseTo(42.100339602923526, 9);
    expect(r.verdict.obstacle?.source).toBe('LIDAR_HD');
  });
});
