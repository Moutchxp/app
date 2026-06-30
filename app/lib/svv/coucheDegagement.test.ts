import { describe, it, expect } from 'vitest';
import { distancePercueFaisceau, noteDegagement } from './coucheDegagement';
import { PROFIL_DEGAGEMENT_DEFAUT as P } from './profilDegagement';
import type { FaisceauResultat } from './scoreDegagement';

/** Faisceau fabriqué à la main (par défaut : axe, dégagé, aucun enrichissement). */
function f(over: Partial<FaisceauResultat> = {}): FaisceauResultat {
  return { offsetDeg: 0, distanceObstacleM: null, ...over };
}

describe('distancePercueFaisceau — F1 base', () => {
  it('neutre : distanceObstacleM = perçue', () => {
    expect(distancePercueFaisceau(f({ distanceObstacleM: 100 }), P)).toBe(100);
  });
  it('dégagé (null) → distanceMaxM (200)', () => {
    expect(distancePercueFaisceau(f({ distanceObstacleM: null }), P)).toBe(200);
  });
  it('F1 plancher : aucun bonus → jamais sous la distance brute', () => {
    expect(distancePercueFaisceau(f({ distanceObstacleM: 120 }), P)).toBe(120);
  });
});

describe('distancePercueFaisceau — F2 (avant 1900)', () => {
  it('ancien à 100 m → 100 × 1.30 = 130', () => {
    const r = distancePercueFaisceau(f({ distanceObstacleM: 100, impactAncien: true }), P);
    expect(r).toBe(130);
  });
  it('ancien sans distance (dégagé) → pas de F2, reste base 200', () => {
    expect(distancePercueFaisceau(f({ distanceObstacleM: null, impactAncien: true }), P)).toBe(200);
  });
});

describe('distancePercueFaisceau — F4 (nature traversée)', () => {
  it('50 m de nature (obstacle à 50) → 50 × 1.50 = 75', () => {
    const r = distancePercueFaisceau(f({ distanceObstacleM: 50, natureTraverseeM: 50 }), P);
    expect(r).toBe(75);
  });
  it('nature plafonne : 180 m → 270 → clampé 200', () => {
    const r = distancePercueFaisceau(f({ distanceObstacleM: 180, natureTraverseeM: 180 }), P);
    expect(r).toBe(200);
  });
});

describe('distancePercueFaisceau — F3 (monument remarquable, forfait)', () => {
  it('dans le cône (offset 0) → 300', () => {
    const r = distancePercueFaisceau(f({ distanceObstacleM: 100, offsetDeg: 0, impactNature: 'Eglise' }), P);
    expect(r).toBe(300);
  });
  it('hors cône (offset 80) → 200', () => {
    const r = distancePercueFaisceau(f({ distanceObstacleM: 100, offsetDeg: 80, impactNature: 'Château' }), P);
    expect(r).toBe(200);
  });
  it('nature NON remarquable (Indifférenciée) → pas de F3', () => {
    const r = distancePercueFaisceau(f({ distanceObstacleM: 100, impactNature: 'Indifférenciée' }), P);
    expect(r).toBe(100);
  });
});

describe('distancePercueFaisceau — mode max (combinaison)', () => {
  it('ancien (130) ET nature (75) → max = 130', () => {
    const r = distancePercueFaisceau(
      f({ distanceObstacleM: 100, impactAncien: true, natureTraverseeM: 50 }),
      P,
    );
    expect(r).toBe(130);
  });
  it('F3 cône (300) ET F2 (130) → max = 300', () => {
    const r = distancePercueFaisceau(
      f({ distanceObstacleM: 100, offsetDeg: 0, impactNature: 'Monument', impactAncien: true }),
      P,
    );
    expect(r).toBe(300);
  });
});

describe('noteDegagement — agrégation /80', () => {
  it('liste vide → 0', () => {
    expect(noteDegagement([], P)).toBe(0);
  });
  it('tous perçus 200 → note plafond 80', () => {
    const fs = Array.from({ length: 5 }, () => f({ distanceObstacleM: null })); // base 200
    expect(noteDegagement(fs, P)).toBe(80);
  });
  it('tous à 0 → note 0', () => {
    const fs = Array.from({ length: 5 }, () => f({ distanceObstacleM: 0 }));
    expect(noteDegagement(fs, P)).toBe(0);
  });
  it('moyenne 100 et 200 → 150 → note (150/200)×80 = 60', () => {
    const fs = [f({ distanceObstacleM: 100 }), f({ distanceObstacleM: null })]; // 100 et 200
    expect(noteDegagement(fs, P)).toBe(60);
  });
});
