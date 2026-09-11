import { describe, it, expect } from 'vitest';
import { deltaEgal, estAjustementModifie, type DeltaComparable } from './ajustementSession';

const D = (o: Partial<DeltaComparable> = {}): DeltaComparable => ({ tx: 0, ty: 0, rotDeg: 0, echelle: 1, ...o });

describe('deltaEgal — égalité de deux deltas rigides à epsilon près', () => {
  it('deux identités sont égales', () => {
    expect(deltaEgal(D(), D())).toBe(true);
  });
  it('une différence sur un scalaire (au-delà d’epsilon) → non égal', () => {
    expect(deltaEgal(D(), D({ tx: 0.65 }))).toBe(false);
    expect(deltaEgal(D(), D({ rotDeg: 1 }))).toBe(false);
    expect(deltaEgal(D(), D({ echelle: 1.02 }))).toBe(false);
  });
  it('un écart INFÉRIEUR à epsilon est ignoré (tolérance numérique)', () => {
    expect(deltaEgal(D(), D({ tx: 1e-12 }))).toBe(true);
  });
});

describe('estAjustementModifie — la session en cours diffère-t-elle de son armement ?', () => {
  it('aucune session (null) → false', () => {
    expect(estAjustementModifie(null, [])).toBe(false);
  });

  it('emprise SANS ajustement persisté, delta identité (à peine armée) → NON modifiée', () => {
    const emprises = [{ id: 5, ajustement: null }];
    expect(estAjustementModifie({ bloc: false, id: 5, delta: D() }, emprises)).toBe(false);
  });

  it('emprise SANS ajustement persisté, delta déplacé → MODIFIÉE', () => {
    const emprises = [{ id: 5, ajustement: null }];
    expect(estAjustementModifie({ bloc: false, id: 5, delta: D({ tx: 0.65 }) }, emprises)).toBe(true);
  });

  it('emprise AVEC ajustement persisté, delta ÉGAL au persisté (armée sur le stocké, intouchée) → NON modifiée', () => {
    const stocke = D({ tx: 2, rotDeg: 3, echelle: 1.1 });
    const emprises = [{ id: 7, ajustement: stocke }];
    expect(estAjustementModifie({ bloc: false, id: 7, delta: { ...stocke } }, emprises)).toBe(false);
  });

  it('emprise AVEC ajustement persisté, delta CHANGÉ depuis le persisté → MODIFIÉE', () => {
    const stocke = D({ tx: 2, rotDeg: 3, echelle: 1.1 });
    const emprises = [{ id: 7, ajustement: stocke }];
    expect(estAjustementModifie({ bloc: false, id: 7, delta: D({ tx: 2.5, rotDeg: 3, echelle: 1.1 }) }, emprises)).toBe(true);
  });

  it('geste d’ENSEMBLE (bloc) : armé sur l’identité → non modifié à l’identité, modifié dès un geste', () => {
    expect(estAjustementModifie({ bloc: true, id: null, delta: D() }, [])).toBe(false);
    expect(estAjustementModifie({ bloc: true, id: null, delta: D({ rotDeg: 2 }) }, [])).toBe(true);
  });
});
