import { describe, it, expect } from 'vitest';
import {
  calculerStrate1,
  calculerStrate2,
  calculerMalusProprete,
  scorePaysage,
} from './scorePaysage';
import type { EntreePaysage, MonumentCandidatFusionne } from './entreePaysage';

/** EntreePaysage neutre, surchargée par `over`. */
function entree(over: Partial<EntreePaysage> = {}): EntreePaysage {
  return {
    photoExploitable: true,
    faisceauxValorisants: 0,
    faisceauxConeTotal: 41,
    monuments: [],
    nuisancesMajeures: [],
    nuisancesMineures: [],
    carrefourMajeur: false,
    cimetiere: false,
    ...over,
  };
}

/** Monument candidat neutre (EIFFEL à 0 m, vue pleine), surchargé par `over`. */
function mon(over: Partial<MonumentCandidatFusionne> = {}): MonumentCandidatFusionne {
  return {
    id: 'EIFFEL',
    distanceM: 0,
    courbe: 'EIFFEL',
    fractionVisible: 'PLUS_DES_TROIS_QUARTS',
    ...over,
  };
}

describe('calculerStrate1', () => {
  it('garde-fou : 2/41 valorisants (< 3) → 0', () => {
    expect(calculerStrate1(entree({ faisceauxValorisants: 2, faisceauxConeTotal: 41 }))).toBe(0);
  });
  it('41/41 → 40', () => {
    expect(calculerStrate1(entree({ faisceauxValorisants: 41, faisceauxConeTotal: 41 }))).toBe(40);
  });
  it('20/40 → 20', () => {
    expect(calculerStrate1(entree({ faisceauxValorisants: 20, faisceauxConeTotal: 40 }))).toBe(20);
  });
  it('faisceauxConeTotal 0 → 0', () => {
    expect(calculerStrate1(entree({ faisceauxValorisants: 5, faisceauxConeTotal: 0 }))).toBe(0);
  });
});

describe('calculerStrate2', () => {
  it('EIFFEL à 0 m, vue pleine → 10 (A5 + B5)', () => {
    const r = calculerStrate2([mon()]);
    expect(r.total).toBe(10);
    expect(r.detail).toEqual([{ id: 'EIFFEL', points: 10 }]);
  });
  it('EIFFEL à 8 km → A5 + B2.5 = 7.5', () => {
    const r = calculerStrate2([mon({ distanceM: 8000 })]);
    expect(r.total).toBeCloseTo(7.5, 10);
    expect(r.detail[0].points).toBeCloseTo(7.5, 10);
  });
  it('LOUVRE à 2 km (courbe AUTRES), AU_MOINS_LA_MOITIE → A4 + B2.5 = 6.5', () => {
    const r = calculerStrate2([
      mon({ id: 'LOUVRE', distanceM: 2000, courbe: 'AUTRES', fractionVisible: 'AU_MOINS_LA_MOITIE' }),
    ]);
    expect(r.total).toBeCloseTo(6.5, 10);
  });
  it('NOTRE_DAME à 5 km, MOINS_DUN_QUART → A0 + B0 = 0', () => {
    const r = calculerStrate2([
      mon({ id: 'NOTRE_DAME', distanceM: 5000, courbe: 'AUTRES', fractionVisible: 'MOINS_DUN_QUART' }),
    ]);
    expect(r.total).toBe(0);
  });
  it('deux monuments à 10 → total plafonné 10, detail montre les points bruts (10 chacun)', () => {
    const r = calculerStrate2([
      mon({ id: 'EIFFEL' }),
      mon({ id: 'SACRE_COEUR', courbe: 'SACRE_COEUR' }),
    ]);
    expect(r.total).toBe(10);
    expect(r.detail).toEqual([
      { id: 'EIFFEL', points: 10 },
      { id: 'SACRE_COEUR', points: 10 },
    ]);
  });
  it('liste vide → total 0, detail []', () => {
    const r = calculerStrate2([]);
    expect(r.total).toBe(0);
    expect(r.detail).toEqual([]);
  });
});

describe('calculerMalusProprete', () => {
  it('1 majeure IA, 0 mineure, géo false → 3', () => {
    expect(calculerMalusProprete(entree({ nuisancesMajeures: ['LIGNE_HAUTE_TENSION'] }))).toBe(3);
  });
  it('2 majeures + 1 mineure (brut 7) → plafonné 6', () => {
    expect(
      calculerMalusProprete(
        entree({
          nuisancesMajeures: ['LIGNE_HAUTE_TENSION', 'INDUSTRIEL_FRICHE'],
          nuisancesMineures: ['ANTENNE_TELECOM'],
        }),
      ),
    ).toBe(6);
  });
  it('aucune nuisance → 0', () => {
    expect(calculerMalusProprete(entree())).toBe(0);
  });
  it('carrefourMajeur true (géo) → 3', () => {
    expect(calculerMalusProprete(entree({ carrefourMajeur: true }))).toBe(3);
  });
  it('1 majeure IA + carrefour + cimetière (brut 9) → plafonné 6', () => {
    expect(
      calculerMalusProprete(
        entree({ nuisancesMajeures: ['SILO_CHATEAU_EAU'], carrefourMajeur: true, cimetiere: true }),
      ),
    ).toBe(6);
  });
});

describe('scorePaysage', () => {
  it('cas nominal : total = strate1 + strate2 − malus', () => {
    const r = scorePaysage(
      entree({
        faisceauxValorisants: 20,
        faisceauxConeTotal: 40,
        monuments: [mon()],
        nuisancesMajeures: ['LIGNE_HAUTE_TENSION'],
      }),
    );
    expect(r.strate1).toBe(20);
    expect(r.strate2).toBe(10);
    expect(r.malusProprete).toBe(3);
    expect(r.total).toBe(27);
    expect(r.scorePartiel).toBe(false);
  });
  it('malus > strate1 + strate2 → total clampé à 0', () => {
    const r = scorePaysage(
      entree({ faisceauxValorisants: 0, monuments: [], nuisancesMajeures: ['LIGNE_HAUTE_TENSION'] }),
    );
    expect(r.strate1).toBe(0);
    expect(r.strate2).toBe(0);
    expect(r.malusProprete).toBe(3);
    expect(r.total).toBe(0);
  });
  it('photoExploitable false → scorePartiel true', () => {
    expect(scorePaysage(entree({ photoExploitable: false })).scorePartiel).toBe(true);
  });
  it('detail reflète les entrées', () => {
    const r = scorePaysage(
      entree({
        faisceauxValorisants: 7,
        faisceauxConeTotal: 41,
        carrefourMajeur: true,
        cimetiere: true,
        nuisancesMajeures: ['INDUSTRIEL_FRICHE'],
        nuisancesMineures: ['MUR_AVEUGLE'],
      }),
    );
    expect(r.detail.faisceauxValorisants).toBe(7);
    expect(r.detail.carrefourApplique).toBe(true);
    expect(r.detail.cimetiereApplique).toBe(true);
    expect(r.detail.nuisancesMajeuresAppliquees).toEqual(['INDUSTRIEL_FRICHE']);
    expect(r.detail.nuisancesMineuresAppliquees).toEqual(['MUR_AVEUGLE']);
  });
});
