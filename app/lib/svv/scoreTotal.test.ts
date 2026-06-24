import { describe, it, expect } from 'vitest';
import { scoreTotal, type LibelleScore } from './scoreTotal';
import { scoreFamille1, type ScoreFamille1, type FaisceauResultat } from './scoreDegagement';
import { scorePaysage } from './scorePaysage';
import type { ScorePaysage } from './entreePaysage';
import { AMPLITUDE_BEAM_COUNT } from './config';

/** ScoreFamille1 minimal avec un total choisi (seul `total` compte ici). */
function f1(total: number): ScoreFamille1 {
  return {
    total,
    distance: total,
    amplitude: 0,
    orientation: 0,
    detail: {
      amplitudePartA: 0,
      amplitudePartB: 0,
      penaliteFlancAppliquee: false,
      moyenneProfondeurM: 0,
      pourcentageFaisceauxDegages: 0,
      secteurOrientation: 'S',
      bonusDernierEtage: 0,
    },
  };
}

/** ScorePaysage minimal : seuls `total` et `scorePartiel` comptent pour scoreTotal. */
function mockF2(total: number, scorePartiel = false): ScorePaysage {
  return {
    total,
    strate1: 0,
    strate2: 0,
    malusProprete: 0,
    scorePartiel,
    detail: {
      faisceauxValorisants: 0,
      monumentsComptes: [],
      nuisancesMajeuresAppliquees: [],
      nuisancesMineuresAppliquees: [],
      carrefourApplique: false,
      cimetiereApplique: false,
    },
  };
}

describe('scoreTotal — seuils de libellé', () => {
  const cas: Array<[number, LibelleScore]> = [
    [100, 'EXCEPTIONNELLE'],
    [75, 'EXCEPTIONNELLE'], // pile
    [74.9, 'EXCELLENTE'],
    [60, 'EXCELLENTE'], // pile
    [59.9, null],
  ];
  for (const [total, libelle] of cas) {
    it(`total ${total} → ${libelle}`, () => {
      // réparti moitié/moitié pour atteindre `total`
      const r = scoreTotal(f1(total / 2), mockF2(total / 2));
      expect(r.total).toBe(total);
      expect(r.libelle).toBe(libelle);
    });
  }
});

describe('scoreTotal — aucun arrondi', () => {
  it('73.5 reste 73.5 et donne EXCELLENTE', () => {
    const r = scoreTotal(f1(40.25), mockF2(33.25));
    expect(r.total).toBe(73.5);
    expect(r.libelle).toBe('EXCELLENTE');
  });
});

describe('scoreTotal — addition', () => {
  it('total = famille1.total + famille2.total', () => {
    const r = scoreTotal(f1(31.2), mockF2(12.8));
    expect(r.total).toBe(44);
  });

  it('plafonné à 100', () => {
    const r = scoreTotal(f1(50), mockF2(50));
    expect(r.total).toBe(100);
  });
});

describe('scoreTotal — score partiel', () => {
  it('famille2.scorePartiel → scorePartiel true ET libelle null même si total ≥ 60', () => {
    const r = scoreTotal(f1(50), mockF2(30, true)); // total 80
    expect(r.total).toBe(80);
    expect(r.scorePartiel).toBe(true);
    expect(r.libelle).toBeNull();
  });
});

describe('scoreTotal — bout-en-bout (moteurs réels)', () => {
  it('vue parfaite → 100 / EXCEPTIONNELLE', () => {
    const faisceaux: FaisceauResultat[] = Array.from(
      { length: AMPLITUDE_BEAM_COUNT },
      () => ({ offsetDeg: 0, distanceObstacleM: null }),
    );
    const sf1 = scoreFamille1({
      distanceAxePrincipalM: null, // aucun obstacle → 20
      faisceaux, // 10 + 10 → 20
      orientationAzimutDeg: 180, // Sud → 10
      dernierEtage: true,
    });
    const sf2 = scorePaysage({
      photoExploitable: true,
      faisceauxValorisants: 41, // Strate1 = 41/41 × 40 = 40
      faisceauxConeTotal: 41,
      monuments: [
        { id: 'EIFFEL', distanceM: 0, courbe: 'EIFFEL', fractionVisible: 'PLUS_DES_TROIS_QUARTS' }, // Strate2 = 10
      ],
      nuisancesMajeures: [],
      nuisancesMineures: [],
      carrefourMajeur: false,
      cimetiere: false,
    });

    expect(sf1.total).toBe(50);
    expect(sf2.total).toBe(50);

    const r = scoreTotal(sf1, sf2);
    expect(r.total).toBe(100);
    expect(r.libelle).toBe('EXCEPTIONNELLE');
    expect(r.scorePartiel).toBe(false);
    expect(r.famille1).toBe(sf1);
    expect(r.famille2).toBe(sf2);
  });
});
