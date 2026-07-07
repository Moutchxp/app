/**
 * Tests de la fonction pure `combinerP1P2` (combinaison nature P1 + bâti P2) et de son
 * intégration dans `distancePercueFaisceau`. Valeurs EXACTES de `docs/SPEC_modes_combinaison.md`.
 *
 * Entrées de référence (MH, cône) : dist=112.5, coeff=2.0, natureM=75, boostF4=2.5, capP1M=200,
 * seuilMinM=30, fam.distMaxM=400 → P1=200, P2=225, diviseur=2.0.
 */
import { describe, it, expect } from 'vitest';
import { combinerP1P2, distancePercueFaisceau } from './coucheDegagement';
import { PROFIL_DEGAGEMENT_DEFAUT as P } from './profilDegagement';
import type { FaisceauResultat } from './scoreDegagement';

// Parts de référence de la spec (natureM ≥ seuil) : P1=200, P2=225, diviseur=2.0.
const P1 = 200;
const P2 = 225;
const DIV = 2.0;
const SEUIL = 30;

describe('combinerP1P2 — natureM ≥ seuilMinM (modeCombinaison actif)', () => {
  it('sequentiel → P1 + P2÷diviseur = 200 + 225/2 = 312.5 (comportement ACTUEL)', () => {
    expect(combinerP1P2(P1, P2, DIV, 75, SEUIL, 'sequentiel', 'addition')).toBe(312.5);
  });
  it('addition → P1 + P2 = 425 (avant cap, sans diviseur)', () => {
    expect(combinerP1P2(P1, P2, DIV, 75, SEUIL, 'addition', 'addition')).toBe(425);
  });
  it('max → max(P1, P2) = 225', () => {
    expect(combinerP1P2(P1, P2, DIV, 75, SEUIL, 'max', 'addition')).toBe(225);
  });
});

describe('combinerP1P2 — natureM < seuilMinM (mode de repli, diviseur = 1)', () => {
  // Sous le seuil, la spec recalcule P1 = min(112.5 + 2.5×20, 200) = 162.5 ; P2 = 225 inchangé.
  const P1_SOUS = 162.5;
  it('repli addition → P1 + P2 = 162.5 + 225 = 387.5', () => {
    expect(combinerP1P2(P1_SOUS, P2, 1.0, 20, SEUIL, 'sequentiel', 'addition')).toBe(387.5);
  });
  it('repli max → max(P1, P2) = 225', () => {
    expect(combinerP1P2(P1_SOUS, P2, 1.0, 20, SEUIL, 'sequentiel', 'max')).toBe(225);
  });
  it('le repli ignore `mode` (diviseur non appliqué) : mode=max mais natureM<seuil → repli addition', () => {
    expect(combinerP1P2(P1_SOUS, P2, DIV, 20, SEUIL, 'max', 'addition')).toBe(387.5);
  });
});

describe('distancePercueFaisceau — bit-identité sequentiel (défaut) = comportement actuel', () => {
  const f = (over: Partial<FaisceauResultat>): FaisceauResultat => ({
    offsetDeg: 0, distanceObstacleM: null, ...over,
  });

  it('MH cône + nature (défaut sequentiel) → 312.5 (200 + 225/2, capé 400)', () => {
    const r = distancePercueFaisceau(
      f({ distanceObstacleM: 112.5, offsetDeg: 0, impactMH: true, natureTraverseeM: 75 }),
      P,
    );
    expect(r).toBe(312.5);
  });

  it('addition (profil surchargé) → P1+P2=425 capé fam.distMaxM=400', () => {
    const profil = { ...P, modeCombinaison: 'addition' as const };
    const r = distancePercueFaisceau(
      f({ distanceObstacleM: 112.5, offsetDeg: 0, impactMH: true, natureTraverseeM: 75 }),
      profil,
    );
    expect(r).toBe(400);
  });

  it('max (profil surchargé) → max(P1,P2)=225', () => {
    const profil = { ...P, modeCombinaison: 'max' as const };
    const r = distancePercueFaisceau(
      f({ distanceObstacleM: 112.5, offsetDeg: 0, impactMH: true, natureTraverseeM: 75 }),
      profil,
    );
    expect(r).toBe(225);
  });

  it('repli sous seuil (natureM=20 < 30), défaut addition → 387.5', () => {
    // P1 = min(112.5 + 2.5×20, 200) = 162.5 ; P2 = 112.5×2 = 225 ; diviseur non appliqué.
    const r = distancePercueFaisceau(
      f({ distanceObstacleM: 112.5, offsetDeg: 0, impactMH: true, natureTraverseeM: 20 }),
      P,
    );
    expect(r).toBe(387.5);
  });

  it('repli max sous seuil (profil surchargé) → 225', () => {
    const profil = { ...P, modeCombinaisonRepli: 'max' as const };
    const r = distancePercueFaisceau(
      f({ distanceObstacleM: 112.5, offsetDeg: 0, impactMH: true, natureTraverseeM: 20 }),
      profil,
    );
    expect(r).toBe(225);
  });
});
