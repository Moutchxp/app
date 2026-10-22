import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { distancePercueFaisceau, noteDegagement, ventilerNote } from './coucheDegagement';
import { erreurPlafondNature, PROFIL_DEGAGEMENT_DEFAUT, type ProfilDegagement } from './profilDegagement';
import { ANALYSIS_RANGE_M, PLAFOND_NATURE_MAX_M } from './config';
import type { FaisceauResultat } from './scoreDegagement';
import type { EntreeComplete } from './analyse';
import { META } from '../../(admin)/admin/(protected)/pilotage/mappingConfig';

/**
 * 🔴 Arno (22/10/2026) — CAPITAL FIXE 61 × portée + PLAFOND DES FAISCEAUX NATURE (choix 1 : le patrimoine garde ses plafonds).
 *   · ordinaire : compté min(perçue, portée) ; · nature (> 0 m d'espace vert) : min(perçue, distance_max_m) ;
 *   · patrimoine : plafonds propres inchangés (nature + patrimoine : le plus grand) ; · note = min(Σ, capital) ÷ capital × 80.
 * Au réglage par défaut (200), tout est identique au bit (golden.test.ts, pipeline.itest.ts).
 */
const fixture = JSON.parse(readFileSync(fileURLToPath(new URL('./__fixtures__/asnieres-golden.json', import.meta.url)), 'utf8')) as
  { entree: EntreeComplete; profil: ProfilDegagement };
const G = fixture.profil;
const P = (plafond: number): ProfilDegagement => ({ ...PROFIL_DEGAGEMENT_DEFAUT, distanceMaxM: plafond });
const f = (o: Partial<FaisceauResultat>): FaisceauResultat => ({ offsetDeg: 0, distanceObstacleM: null, natureTraverseeM: 0, ...o });

describe('🔴 ce que compte un faisceau', () => {
  it('2 m de nature devant du bâti à 80 m, plafond nature 300 → compté 85 (sa distance perçue), pas 300', () => {
    expect(distancePercueFaisceau(f({ distanceObstacleM: 80, natureTraverseeM: 2 }), P(300))).toBe(85);
  });
  it('Ulbach −27° (bâti à 124,6 m, 87,6 m de parc) : plafond nature 300 → compté 300 ; 200 → 200', () => {
    const u = f({ offsetDeg: -27, distanceObstacleM: 124.59903893844591, natureTraverseeM: 87.6 });
    expect(distancePercueFaisceau(u, P(300))).toBe(300);
    expect(distancePercueFaisceau(u, P(200))).toBe(200);
  });
  it('bâti ordinaire (ni nature ni patrimoine) à 260 m perçus → compté 200 (la portée), quel que soit le plafond nature', () => {
    for (const plafond of [200, 300, 500]) expect(distancePercueFaisceau(f({ distanceObstacleM: 260 }), P(plafond))).toBe(ANALYSIS_RANGE_M);
    expect(distancePercueFaisceau(f({ distanceObstacleM: null }), P(500))).toBe(ANALYSIS_RANGE_M);   // dégagé, sans nature
  });
  it('Asnières −21° (1883, 137 m, coefficient 1,5) → 205,6 m, inchangé quel que soit le plafond nature', () => {
    const a = f({ offsetDeg: -21, distanceObstacleM: 137.06385373248486, impactAnnee: 1883 });
    for (const plafond of [200, 300, 500]) expect(distancePercueFaisceau(a, { ...G, distanceMaxM: plafond })).toBe(205.5957805987273);
  });
});

describe('🔴 la note', () => {
  it('monotonie : monter le plafond nature ne fait jamais baisser le score (golden et éventail mixte)', () => {
    const mixte = Array.from({ length: 61 }, (_, i) => f({
      offsetDeg: -90 + 3 * i,
      distanceObstacleM: i % 5 === 0 ? null : 20 + 3 * i,
      natureTraverseeM: i % 3 === 0 ? 4 * i : 0,
      impactAnnee: i % 7 === 0 ? 1890 : null,
    }));
    for (const [faisceaux, profil] of [[fixture.entree.faisceauxScore!, G], [mixte, PROFIL_DEGAGEMENT_DEFAUT]] as const) {
      let precedent = -Infinity;
      for (let plafond = ANALYSIS_RANGE_M; plafond <= PLAFOND_NATURE_MAX_M; plafond += 10) {
        const n = noteDegagement(faisceaux, { ...profil, distanceMaxM: plafond }, 229);
        expect(n).toBeGreaterThanOrEqual(precedent);
        precedent = n;
      }
    }
  });
  it('garde-fou : une somme au-delà du capital (61 × 200 = 12 200 m) est plafonnée au capital', () => {
    const mondial = Array.from({ length: 61 }, (_, i) => f({ offsetDeg: -90 + 3 * i, distanceObstacleM: 50, impactEmblematique: true }));
    const v = ventilerNote(mondial, PROFIL_DEGAGEMENT_DEFAUT);
    expect(v.capitalM).toBe(61 * ANALYSIS_RANGE_M);
    expect(v.cumulCompteM).toBe(61 * 800);
    expect(v.plafonneAuCapital).toBe(true);
    expect(v.noteAvantOrientation).toBe(PROFIL_DEGAGEMENT_DEFAUT.plafondDegagement);
  });
  it('au défaut (200), la note du golden est exactement celle scellée', () => {
    expect(noteDegagement(fixture.entree.faisceauxScore!, G, fixture.entree.orientationAzimutDeg)).toBe(40.77232776704026);
  });
});

describe('🔴 bornes du plafond des faisceaux nature : portée ≤ v ≤ 500, partout', () => {
  it('300, 200 et 500 acceptés ; 150, 600 et une valeur non numérique refusés, avec un message', () => {
    for (const v of [200, 300, 500]) expect(erreurPlafondNature(v)).toBeNull();
    for (const v of [150, 600, Number.NaN]) expect(erreurPlafondNature(v)).toMatch(/entre 200 m .*et 500 m/);
  });
  it('les bornes recopiées dans la méta du pilotage et du banc sont celles du moteur', () => {
    const meta = META.find((m) => m.colonne === 'distance_max_m')!;
    expect(meta.min).toBe(ANALYSIS_RANGE_M);
    expect(meta.max).toBe(PLAFOND_NATURE_MAX_M);
    expect(readFileSync(fileURLToPath(new URL('../../(admin)/api/admin/config/repli.ts', import.meta.url)), 'utf8'))
      .toContain(`const PLAFOND_NATURE_MAX_M = ${PLAFOND_NATURE_MAX_M};`);
  });
});
