import { describe, it, expect } from 'vitest';
import { scoreTotal, type LibelleScore } from './scoreTotal';
import type { ScoreFamille1, FaisceauResultat } from './scoreDegagement';
import type { ScorePaysage } from './entreePaysage';
import { PROFIL_DEGAGEMENT_DEFAUT as P } from './profilDegagement';

// NOUVEAU MODÈLE : total = noteDegagement(faisceaux) /90 (Couche 1). famille1 (Résultat A) et
// famille2 (paysage) sont conservés pour AUDIT mais N'ALIMENTENT PLUS le total. Seul
// famille2.scorePartiel reste consommé (neutralise le libellé).

/** ScoreFamille1 minimal (audit only). */
function f1(): ScoreFamille1 {
  return {
    total: 0, distance: 0, amplitude: 0, orientation: 0,
    detail: {
      amplitudePartA: 0, amplitudePartB: 0, penaliteFlancAppliquee: false,
      moyenneProfondeurM: 0, pourcentageFaisceauxDegages: 0, secteurOrientation: 'S', bonusDernierEtage: 0,
    },
  };
}

/** ScorePaysage minimal : seul `scorePartiel` est consommé par scoreTotal. */
function mockF2(scorePartiel = false): ScorePaysage {
  return {
    total: 0, strate1: 0, strate2: 0, malusProprete: 0, scorePartiel,
    detail: {
      faisceauxValorisants: 0, monumentsComptes: [], nuisancesMajeuresAppliquees: [],
      nuisancesMineuresAppliquees: [], carrefourApplique: false, cimetiereApplique: false,
    },
  };
}

/**
 * 5 faisceaux NEUTRES produisant une note Couche 1 cible :
 * perçue = distanceObstacleM ; note = (moyenne / distanceMaxM) × plafondCouche1
 * ⇒ distanceObstacleM = note × distanceMaxM / plafondCouche1 (= note × 200/90 pour le profil défaut).
 */
function faisceauxNote(noteCible: number): FaisceauResultat[] {
  const dist = (noteCible * P.distanceMaxM) / P.plafondCouche1;
  return Array.from({ length: 5 }, () => ({ offsetDeg: 0, distanceObstacleM: dist }));
}

describe('scoreTotal — total = note Couche 1 /90 (sur les faisceaux)', () => {
  it('faisceaux dégagés → plafond 90', () => {
    const fs: FaisceauResultat[] = Array.from({ length: 5 }, () => ({ offsetDeg: 0, distanceObstacleM: null }));
    expect(scoreTotal(f1(), mockF2(), fs).total).toBe(90);
  });
  it('faisceaux à 0 → note 0', () => {
    const fs: FaisceauResultat[] = Array.from({ length: 5 }, () => ({ offsetDeg: 0, distanceObstacleM: 0 }));
    expect(scoreTotal(f1(), mockF2(), fs).total).toBe(0);
  });
  it('aucun arrondi : note 73.5 reste 73.5', () => {
    expect(scoreTotal(f1(), mockF2(), faisceauxNote(73.5)).total).toBeCloseTo(73.5, 10);
  });
  it('famille1 et famille2 conservés dans le retour (audit), hors total', () => {
    const sf1 = f1(); const sf2 = mockF2();
    const r = scoreTotal(sf1, sf2, faisceauxNote(60));
    expect(r.total).toBeCloseTo(60, 10);
    expect(r.famille1).toBe(sf1);
    expect(r.famille2).toBe(sf2);
  });
});

describe('scoreTotal — seuils de libellé', () => {
  const cas: Array<[number, LibelleScore]> = [
    [80, 'EXCEPTIONNELLE'],
    [75, 'EXCEPTIONNELLE'], // pile
    [74.9, 'EXCELLENTE'],
    [60, 'EXCELLENTE'], // pile
    [59.9, null],
  ];
  for (const [note, libelle] of cas) {
    it(`note ${note} → ${libelle}`, () => {
      const r = scoreTotal(f1(), mockF2(), faisceauxNote(note));
      expect(r.total).toBeCloseTo(note, 10);
      expect(r.libelle).toBe(libelle);
    });
  }
});

describe('scoreTotal — score partiel', () => {
  it('famille2.scorePartiel → scorePartiel true ET libelle null même si note ≥ 75', () => {
    const r = scoreTotal(f1(), mockF2(true), faisceauxNote(80));
    expect(r.total).toBe(80);
    expect(r.scorePartiel).toBe(true);
    expect(r.libelle).toBeNull();
  });
});
