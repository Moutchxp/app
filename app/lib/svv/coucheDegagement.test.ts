import { describe, it, expect } from 'vitest';
import { distancePercueFaisceau, noteDegagement, chaineCouloir } from './coucheDegagement';
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
  it('50 m de nature (obstacle à 50) → additif base 50 + 2.5×50 = 175', () => {
    const r = distancePercueFaisceau(f({ distanceObstacleM: 50, natureTraverseeM: 50 }), P);
    expect(r).toBe(175);
  });
  it('nature plafonne : 180 + 2.5×180 = 630 → clampé 200', () => {
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
  it('ancien (F2=130) ET nature (F4 additif 100+2.5×50=225 → clampé 200) → max = 200 (F4 domine)', () => {
    const r = distancePercueFaisceau(
      f({ distanceObstacleM: 100, impactAncien: true, natureTraverseeM: 50 }),
      P,
    );
    expect(r).toBe(200);
  });
  it('F3 cône (300) ET F2 (130) → max = 300', () => {
    const r = distancePercueFaisceau(
      f({ distanceObstacleM: 100, offsetDeg: 0, impactNature: 'Monument', impactAncien: true }),
      P,
    );
    expect(r).toBe(300);
  });
});

describe('noteDegagement — malus couloir (mur longeant l\'axe)', () => {
  // Faisceaux fabriqués : SEULS offsetDeg + distanceObstacleM renseignés (enrichissements = défaut,
  // donc distancePercueFaisceau = base = distanceObstacleM). Profil = PROFIL_DEGAGEMENT_DEFAUT.
  const faisceaux: FaisceauResultat[] = [
    f({ offsetDeg: 90, distanceObstacleM: 2.0 }),    // droite — latéral 2.0
    f({ offsetDeg: 60, distanceObstacleM: 2.5 }),    // droite — latéral 2.165
    f({ offsetDeg: 30, distanceObstacleM: 4.0 }),    // droite — latéral 2.0 ; axial 3.464
    f({ offsetDeg: 15, distanceObstacleM: 20.0 }),   // droite — latéral 5.18 > 3 → RUPTURE
    f({ offsetDeg: -90, distanceObstacleM: 150.0 }), // gauche — latéral 150 → aucune chaîne
    f({ offsetDeg: -45, distanceObstacleM: 120.0 }), // gauche
    f({ offsetDeg: 0, distanceObstacleM: 180.0 }),   // axe (ni gauche ni droite)
  ];

  it('côté droite : chaîne VALIDÉE de 3 faisceaux, mur ≈ 3.464102 m', () => {
    const ch = chaineCouloir(faisceaux, P, 'droite');
    expect(ch.validee).toBe(true);
    expect(ch.faisceaux.length).toBe(3);
    expect(ch.longueurMur).toBeCloseTo(3.464102, 6); // 4.0 × cos(30°)
  });

  it('côté gauche : AUCUNE chaîne (obstacles trop loin)', () => {
    const ch = chaineCouloir(faisceaux, P, 'gauche');
    expect(ch.validee).toBe(false);
    expect(ch.faisceaux.length).toBe(0);
  });

  it('note AVEC malus (÷2 sur les 3 faisceaux de droite) ≈ 30.4875', () => {
    // moyenne = (1.0+1.25+2.0+20+150+120+180)/7 = 67.75 → ×90/200 = 30.4875
    expect(noteDegagement(faisceaux, P)).toBeCloseTo(30.4875, 6);
  });

  it('note SANS malus (couloirFacteur=1, géométrie identique) ≈ 30.760714 → prouve le ÷2', () => {
    // moyenne = (2.0+2.5+4.0+20+150+120+180)/7 = 68.357143 → ×90/200 = 30.760714
    expect(noteDegagement(faisceaux, { ...P, couloirFacteur: 1 })).toBeCloseTo(30.760714, 6);
  });
});

describe('noteDegagement — agrégation /90', () => {
  it('liste vide → 0', () => {
    expect(noteDegagement([], P)).toBe(0);
  });
  it('tous perçus 200 → note plafond 90', () => {
    const fs = Array.from({ length: 5 }, () => f({ distanceObstacleM: null })); // base 200
    expect(noteDegagement(fs, P)).toBe(90);
  });
  it('tous à 0 → note 0', () => {
    const fs = Array.from({ length: 5 }, () => f({ distanceObstacleM: 0 }));
    expect(noteDegagement(fs, P)).toBe(0);
  });
  it('moyenne 100 et 200 → 150 → note (150/200)×90 = 67.5', () => {
    const fs = [f({ distanceObstacleM: 100 }), f({ distanceObstacleM: null })]; // 100 et 200
    expect(noteDegagement(fs, P)).toBe(67.5);
  });
});
