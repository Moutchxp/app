import { describe, it, expect } from 'vitest';
import { fusionnerMonuments, assemblerEntreePaysage } from './fusionPaysage';
import type { MonumentCandidatGeo, PaysageGeometrique } from './preparateurPaysage';
import type { MonumentVisible, ReponseIaPhoto } from './contratIaPhoto';

function geoMon(
  id: MonumentCandidatGeo['id'],
  distanceM: number,
  courbe: MonumentCandidatGeo['courbe'],
  ecartDeg = 0,
): MonumentCandidatGeo {
  return { id, distanceM, courbe, ecartDeg };
}
function iaMon(
  id: MonumentVisible['id'],
  fractionVisible: MonumentVisible['fractionVisible'],
): MonumentVisible {
  return { id, fractionVisible };
}

describe('fusionnerMonuments', () => {
  it('a) monument présent géo ET IA : conservé, fractionVisible IA, distance/courbe géo', () => {
    const geo = [geoMon('EIFFEL', 3500, 'EIFFEL', -10)];
    const ia = [iaMon('EIFFEL', 'AU_MOINS_LA_MOITIE')];
    expect(fusionnerMonuments(geo, ia)).toEqual([
      { id: 'EIFFEL', distanceM: 3500, courbe: 'EIFFEL', fractionVisible: 'AU_MOINS_LA_MOITIE' },
    ]);
  });

  it("b) candidat géo absent de l'IA : exclu (Option B)", () => {
    const geo = [geoMon('LOUVRE', 800, 'AUTRES')];
    const ia: MonumentVisible[] = [];
    expect(fusionnerMonuments(geo, ia)).toEqual([]);
  });

  it('c) monument IA sans candidat géo correspondant : ignoré', () => {
    const geo: MonumentCandidatGeo[] = [];
    const ia = [iaMon('EIFFEL', 'PLUS_DES_TROIS_QUARTS')];
    expect(fusionnerMonuments(geo, ia)).toEqual([]);
  });
});

describe('assemblerEntreePaysage', () => {
  it('d) photoExploitable false : monuments [] ET nuisances [], faisceaux toujours recopiés', () => {
    const geo: PaysageGeometrique = {
      faisceauxValorisants: 12,
      faisceauxConeTotal: 41,
      monuments: [geoMon('EIFFEL', 3500, 'EIFFEL')],
    };
    const ia: ReponseIaPhoto = {
      photoExploitable: false,
      monuments: [iaMon('EIFFEL', 'PLUS_DES_TROIS_QUARTS')],
      nuisancesMajeures: ['LIGNE_HAUTE_TENSION'],
      nuisancesMineures: ['MUR_AVEUGLE'],
    };
    const e = assemblerEntreePaysage(geo, ia);
    expect(e.photoExploitable).toBe(false);
    expect(e.faisceauxValorisants).toBe(12);
    expect(e.faisceauxConeTotal).toBe(41);
    expect(e.monuments).toEqual([]);
    expect(e.nuisancesMajeures).toEqual([]);
    expect(e.nuisancesMineures).toEqual([]);
    expect(e.carrefourMajeur).toBe(false);
    expect(e.cimetiere).toBe(false);
  });

  it('e) photoExploitable true : nuisances telles quelles, carrefour/cimetiere false', () => {
    const geo: PaysageGeometrique = {
      faisceauxValorisants: 5,
      faisceauxConeTotal: 41,
      monuments: [geoMon('LOUVRE', 800, 'AUTRES')],
    };
    const ia: ReponseIaPhoto = {
      photoExploitable: true,
      monuments: [iaMon('LOUVRE', 'AU_MOINS_UN_QUART')],
      nuisancesMajeures: ['INDUSTRIEL_FRICHE'],
      nuisancesMineures: ['GRAND_PARKING', 'ANTENNE_TELECOM'],
    };
    const e = assemblerEntreePaysage(geo, ia);
    expect(e.photoExploitable).toBe(true);
    expect(e.monuments).toEqual([
      { id: 'LOUVRE', distanceM: 800, courbe: 'AUTRES', fractionVisible: 'AU_MOINS_UN_QUART' },
    ]);
    expect(e.nuisancesMajeures).toEqual(['INDUSTRIEL_FRICHE']);
    expect(e.nuisancesMineures).toEqual(['GRAND_PARKING', 'ANTENNE_TELECOM']);
    expect(e.carrefourMajeur).toBe(false);
    expect(e.cimetiere).toBe(false);
  });

  it('f) géo vide : monuments []', () => {
    const geo: PaysageGeometrique = { faisceauxValorisants: 0, faisceauxConeTotal: 41, monuments: [] };
    const ia: ReponseIaPhoto = {
      photoExploitable: true,
      monuments: [iaMon('EIFFEL', 'PLUS_DES_TROIS_QUARTS')],
      nuisancesMajeures: [],
      nuisancesMineures: [],
    };
    const e = assemblerEntreePaysage(geo, ia);
    expect(e.monuments).toEqual([]);
  });
});
