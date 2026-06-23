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
  it('cône central tout dégagé → 10', () => {
    expect(scoreFamille1(entree()).detail.amplitudePartA).toBe(10);
  });

  it('0 dégagé → 0', () => {
    // obstacle proche (10 m < seuil) sur tous les faisceaux
    const f = faisceaux(() => 10);
    expect(scoreFamille1(entree({ faisceaux: f })).detail.amplitudePartA).toBe(0);
  });

  it('30 dégagés à gauche, mais seuls 20 dans le cône ±60° → 10 × 20/41', () => {
    // i<30 dégagés (null) ; le cône central est |offset|≤60 = i∈[10,50] (41 faisceaux),
    // dont les dégagés sont i=10..29 → 20/41. Les i<10 (offset < −60) ne comptent plus.
    const f = faisceaux((i) => (i < 30 ? null : 10));
    expect(scoreFamille1(entree({ faisceaux: f })).detail.amplitudePartA).toBe(
      (10 * 20) / 41,
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

describe('scoreFamille1 — pénalité de flanc (deux flancs, suite consécutive, paliers)', () => {
  /** Construit des faisceaux où les offsets de `cibles` portent `dist`, le reste dégagé. */
  const flanc = (cibles: number[], dist: number) =>
    faisceaux((_, offset) => (cibles.includes(offset) ? dist : null));

  it('un seul faisceau de flanc à 3 m (< 3 consécutifs) → PAS de pénalité', () => {
    const r = scoreFamille1(entree({ faisceaux: flanc([75], 3) }));
    expect(r.detail.penaliteFlancAppliquee).toBe(false);
    expect(r.amplitude).toBe(20); // partA 10 + partB 10, inchangé
  });

  it('obstacle proche au centre (offset 45°) → PAS de pénalité', () => {
    const r = scoreFamille1(entree({ faisceaux: flanc([45], 3) }));
    expect(r.detail.penaliteFlancAppliquee).toBe(false);
  });

  it('flanc 3 consécutifs mais à 10 m (> 7) → PAS de pénalité', () => {
    const r = scoreFamille1(entree({ faisceaux: flanc([63, 66, 69], 10) }));
    expect(r.detail.penaliteFlancAppliquee).toBe(false);
  });

  it('3 consécutifs à 6 m → ÷2', () => {
    const r = scoreFamille1(entree({ faisceaux: flanc([63, 66, 69], 6) }));
    expect(r.detail.penaliteFlancAppliquee).toBe(true);
    expect(r.amplitude).toBeCloseTo((r.detail.amplitudePartA + r.detail.amplitudePartB) / 2, 10);
  });

  it('3 consécutifs à 4 m → ÷3, distance & orientation inchangées', () => {
    const r = scoreFamille1(
      entree({ faisceaux: flanc([63, 66, 69], 4), distanceAxePrincipalM: 120, orientationAzimutDeg: 180 }),
    );
    expect(r.amplitude).toBeCloseTo((r.detail.amplitudePartA + r.detail.amplitudePartB) / 3, 10);
    expect(r.distance).toBe(10);
    expect(r.orientation).toBe(10);
  });

  it('3 consécutifs à 5 m pile → ÷2', () => {
    const r = scoreFamille1(entree({ faisceaux: flanc([63, 66, 69], 5) }));
    expect(r.amplitude).toBeCloseTo((r.detail.amplitudePartA + r.detail.amplitudePartB) / 2, 10);
  });

  it('3 consécutifs à 7 m pile → ÷2', () => {
    const r = scoreFamille1(entree({ faisceaux: flanc([63, 66, 69], 7) }));
    expect(r.amplitude).toBeCloseTo((r.detail.amplitudePartA + r.detail.amplitudePartB) / 2, 10);
  });

  it('suite à 6 m + faisceau isolé à 2 m (même flanc) → ÷3 (le minimum du flanc commande)', () => {
    // 63,66,69 à 6 m (suite qui déclenche) ; 81 isolé à 2 m (72,75,78 et 84,87,90 dégagés).
    const f = faisceaux((_, offset) =>
      offset === 63 || offset === 66 || offset === 69 ? 6 : offset === 81 ? 2 : null,
    );
    const r = scoreFamille1(entree({ faisceaux: f }));
    expect(r.detail.penaliteFlancAppliquee).toBe(true);
    expect(r.amplitude).toBeCloseTo((r.detail.amplitudePartA + r.detail.amplitudePartB) / 3, 10);
  });

  it('seulement 2 consécutifs ≤ 7 → PAS de pénalité', () => {
    const r = scoreFamille1(entree({ faisceaux: flanc([63, 66], 6) }));
    expect(r.detail.penaliteFlancAppliquee).toBe(false);
  });

  it('suite cassée par un trou (63 et 69 obstrués, 66 dégagé) → PAS de pénalité', () => {
    const r = scoreFamille1(entree({ faisceaux: flanc([63, 69], 6) }));
    expect(r.detail.penaliteFlancAppliquee).toBe(false);
  });

  it('LES DEUX flancs déclenchés → amplitude 0', () => {
    const f = faisceaux((_, offset) =>
      [-63, -66, -69, 63, 66, 69].includes(offset) ? 6 : null,
    );
    const r = scoreFamille1(entree({ faisceaux: f }));
    expect(r.detail.penaliteFlancAppliquee).toBe(true);
    expect(r.amplitude).toBe(0);
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
