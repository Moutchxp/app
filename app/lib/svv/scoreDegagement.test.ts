import { describe, it, expect } from 'vitest';
import {
  scoreFamille1,
  azimutVersSecteur,
  type FaisceauResultat,
  type EntreeFamille1,
} from './scoreDegagement';
import { AMPLITUDE_BEAM_COUNT, AMPLITUDE_BEAM_STEP_DEG } from './config';

/** Offset (deg) du faisceau i, de −90 à +90, dérivé des constantes. */
function offsetDe(i: number): number {
  const demi = ((AMPLITUDE_BEAM_COUNT - 1) / 2) * AMPLITUDE_BEAM_STEP_DEG;
  return -demi + i * AMPLITUDE_BEAM_STEP_DEG;
}

/** Construit 61 faisceaux ; `dist(i, offset)` renvoie la distance (ou null). */
function faisceaux(
  dist: (i: number, offset: number) => number | null,
): FaisceauResultat[] {
  return Array.from({ length: AMPLITUDE_BEAM_COUNT }, (_, i) => {
    const offsetDeg = offsetDe(i);
    return { offsetDeg, distanceObstacleM: dist(i, offsetDeg) };
  });
}

const tousDegages = faisceaux(() => null);

function entree(over: Partial<EntreeFamille1> = {}): EntreeFamille1 {
  return {
    distanceAxePrincipalM: null,
    faisceaux: tousDegages,
    orientationAzimutDeg: 180, // Sud
    dernierEtage: false,
    ...over,
  };
}

describe('scoreFamille1 — distance (20 pts)', () => {
  const cas: Array<[number | null, number]> = [
    [40, 0],
    [200, 20],
    [120, 10],
    [null, 20],
    [30, 0],
  ];
  for (const [d, attendu] of cas) {
    it(`d=${d} → ${attendu}`, () => {
      expect(scoreFamille1(entree({ distanceAxePrincipalM: d })).distance).toBe(attendu);
    });
  }
});

describe('scoreFamille1 — amplitude Part A (largeur, 10 pts)', () => {
  it('61 dégagés → 10', () => {
    expect(scoreFamille1(entree()).detail.amplitudePartA).toBe(10);
  });

  it('0 dégagé → 0', () => {
    // obstacle proche (10 m < seuil) sur tous les faisceaux
    const f = faisceaux(() => 10);
    expect(scoreFamille1(entree({ faisceaux: f })).detail.amplitudePartA).toBe(0);
  });

  it('30/61 dégagés → 10 × 30/61', () => {
    // 30 dégagés (null), 31 bloqués (10 m)
    const f = faisceaux((i) => (i < 30 ? null : 10));
    expect(scoreFamille1(entree({ faisceaux: f })).detail.amplitudePartA).toBe(
      (10 * 30) / 61,
    );
  });
});

describe('scoreFamille1 — amplitude Part B (profondeur, 10 pts)', () => {
  it('tous dégagés (200 m = CLEAR_BEAM_DIST_M) → plafond 10', () => {
    const r = scoreFamille1(entree());
    expect(r.detail.moyenneProfondeurM).toBe(200);
    expect(r.detail.amplitudePartB).toBe(10); // 1 + (200 − 30) × 9/170 = 10
  });

  it('ancrage bas : moyenne 30 m → 1 pt', () => {
    const f = faisceaux(() => 30);
    const r = scoreFamille1(entree({ faisceaux: f }));
    expect(r.detail.moyenneProfondeurM).toBe(30);
    expect(r.detail.amplitudePartB).toBe(1);
  });

  it('mi-pente : moyenne 115 m → 5.5 pts', () => {
    const f = faisceaux(() => 115); // 1 + (115 − 30) × 9/170 = 5.5
    expect(scoreFamille1(entree({ faisceaux: f })).detail.amplitudePartB).toBe(5.5);
  });
});

describe('scoreFamille1 — pénalité « angle de L »', () => {
  it('flanc 75° à 3 m → amplitude ÷3, distance & orientation inchangées', () => {
    // un seul faisceau flanc bloqué à 3 m
    const f = faisceaux((_, offset) => (offset === 75 ? 3 : null));
    const r = scoreFamille1(
      entree({ faisceaux: f, distanceAxePrincipalM: 120, orientationAzimutDeg: 180 }),
    );
    expect(r.detail.penaliteFlancAppliquee).toBe(true);
    // amplitude = (partA + partB) / 3
    expect(r.amplitude).toBeCloseTo(
      (r.detail.amplitudePartA + r.detail.amplitudePartB) / 3,
      10,
    );
    // distance et orientation ne bougent pas
    expect(r.distance).toBe(10);
    expect(r.orientation).toBe(10);
  });

  it('obstacle proche au centre (offset 45°) → PAS de pénalité', () => {
    const f = faisceaux((_, offset) => (offset === 45 ? 3 : null));
    expect(scoreFamille1(entree({ faisceaux: f })).detail.penaliteFlancAppliquee).toBe(
      false,
    );
  });

  it('flanc 75° mais à 10 m (≥ 5) → PAS de pénalité', () => {
    const f = faisceaux((_, offset) => (offset === 75 ? 10 : null));
    expect(scoreFamille1(entree({ faisceaux: f })).detail.penaliteFlancAppliquee).toBe(
      false,
    );
  });
});

describe('scoreFamille1 — orientation (10 pts)', () => {
  const secteurs: Array<[number, number, string]> = [
    [180, 10, 'S'],
    [225, 10, 'SO'],
    [135, 8, 'SE'],
    [270, 7, 'O'],
    [315, 6, 'NO'],
    [90, 4, 'E'],
    [45, 2, 'NE'],
    [0, 0, 'N'],
  ];
  for (const [az, pts, secteur] of secteurs) {
    it(`azimut ${az} → ${secteur} = ${pts}`, () => {
      expect(azimutVersSecteur(az)).toBe(secteur);
      expect(scoreFamille1(entree({ orientationAzimutDeg: az })).orientation).toBe(pts);
    });
  }

  it('bonus dernier étage : O (7) + dernierEtage → 8', () => {
    const r = scoreFamille1(entree({ orientationAzimutDeg: 270, dernierEtage: true }));
    expect(r.orientation).toBe(8);
    expect(r.detail.bonusDernierEtage).toBe(1);
  });

  it('pas de bonus si déjà 10 : S (10) + dernierEtage → 10', () => {
    const r = scoreFamille1(entree({ orientationAzimutDeg: 180, dernierEtage: true }));
    expect(r.orientation).toBe(10);
    expect(r.detail.bonusDernierEtage).toBe(0);
  });
});

describe('scoreFamille1 — validation', () => {
  it('mauvaise longueur de faisceaux → throw', () => {
    const f = faisceaux(() => null).slice(0, 60);
    expect(() => scoreFamille1(entree({ faisceaux: f }))).toThrow();
  });
});

describe('scoreFamille1 — cas complet réaliste', () => {
  it('distance 120 + tout dégagé + Sud = 40/50', () => {
    const r = scoreFamille1(
      entree({ distanceAxePrincipalM: 120, faisceaux: tousDegages, orientationAzimutDeg: 180 }),
    );
    expect(r.distance).toBe(10);
    expect(r.amplitude).toBe(20); // partA 10 + partB 10 (200 m), pas de pénalité
    expect(r.orientation).toBe(10);
    expect(r.total).toBe(40);
  });

  it('vue 100 % dégagée, plein Sud, dernier étage → 50/50 (maximum)', () => {
    const r = scoreFamille1(
      entree({
        distanceAxePrincipalM: null, // aucun obstacle sur l'axe → 20
        faisceaux: tousDegages, // partA 10 + partB 10 → 20
        orientationAzimutDeg: 180, // Sud → 10 (pas de bonus, déjà au max)
        dernierEtage: true,
      }),
    );
    expect(r.distance).toBe(20);
    expect(r.amplitude).toBe(20);
    expect(r.orientation).toBe(10);
    expect(r.total).toBe(50);
  });
});
