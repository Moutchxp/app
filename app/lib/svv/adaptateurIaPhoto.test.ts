import { describe, it, expect } from 'vitest';
import { parserReponseIa } from './adaptateurIaPhoto';
import type { MonumentId } from './contratIaPhoto';

const CANDIDATS: MonumentId[] = ['EIFFEL', 'LOUVRE', 'PANTHEON'];

describe('parserReponseIa', () => {
  it('JSON valide exploitable : mappe camelCase + filtre id hors candidats et fraction invalide', () => {
    const json = JSON.stringify({
      photo_exploitable: true,
      monuments: [
        { id: 'EIFFEL', fraction_visible: 'PLUS_DES_TROIS_QUARTS' },
        { id: 'LOUVRE', fraction_visible: 'MOINS_DUN_QUART' },
        { id: 'INCONNU_XYZ', fraction_visible: 'PLUS_DES_TROIS_QUARTS' }, // id hors candidats → filtré
        { id: 'PANTHEON', fraction_visible: 'PEUT_ETRE' }, // fraction invalide → filtré
      ],
      nuisances_majeures: [],
      nuisances_mineures: [],
    });
    const r = parserReponseIa(json, CANDIDATS);
    expect(r.photoExploitable).toBe(true);
    expect(r.monuments).toEqual([
      { id: 'EIFFEL', fractionVisible: 'PLUS_DES_TROIS_QUARTS' },
      { id: 'LOUVRE', fractionVisible: 'MOINS_DUN_QUART' },
    ]);
    expect(r.nuisancesMajeures).toEqual([]);
    expect(r.nuisancesMineures).toEqual([]);
  });

  it('photo_exploitable false : monuments/nuisances vidés même si présents', () => {
    const json = JSON.stringify({
      photo_exploitable: false,
      monuments: [{ id: 'EIFFEL', fraction_visible: 'PLUS_DES_TROIS_QUARTS' }],
      nuisances_majeures: ['LIGNE_HAUTE_TENSION'],
      nuisances_mineures: ['MUR_AVEUGLE'],
    });
    const r = parserReponseIa(json, CANDIDATS);
    expect(r).toEqual({
      photoExploitable: false,
      monuments: [],
      nuisancesMajeures: [],
      nuisancesMineures: [],
    });
  });

  it('JSON malformé : fallback inexploitable', () => {
    const r = parserReponseIa('{pas du json', CANDIDATS);
    expect(r).toEqual({
      photoExploitable: false,
      monuments: [],
      nuisancesMajeures: [],
      nuisancesMineures: [],
    });
  });

  it('nuisances : valeur inconnue filtrée + doublons dédoublonnés', () => {
    const json = JSON.stringify({
      photo_exploitable: true,
      monuments: [],
      nuisances_majeures: ['LIGNE_HAUTE_TENSION', 'TRUC_BIDON', 'LIGNE_HAUTE_TENSION'],
      nuisances_mineures: ['MUR_AVEUGLE', 'MUR_AVEUGLE', 'GRAND_PARKING'],
    });
    const r = parserReponseIa(json, CANDIDATS);
    expect(r.photoExploitable).toBe(true);
    expect(r.nuisancesMajeures).toEqual(['LIGNE_HAUTE_TENSION']);
    expect(r.nuisancesMineures).toEqual(['MUR_AVEUGLE', 'GRAND_PARKING']);
  });

  it('idsCandidats vide : aucun monument retenu', () => {
    const json = JSON.stringify({
      photo_exploitable: true,
      monuments: [{ id: 'EIFFEL', fraction_visible: 'PLUS_DES_TROIS_QUARTS' }],
      nuisances_majeures: [],
      nuisances_mineures: [],
    });
    const r = parserReponseIa(json, []);
    expect(r.photoExploitable).toBe(true);
    expect(r.monuments).toEqual([]);
  });
});
