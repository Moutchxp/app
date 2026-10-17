import { describe, expect, it } from 'vitest';
import { aplatirResultats, type LigneRecherche } from './recherchePortefeuille';

const l = (id: number, ancien = false): LigneRecherche => ({ id, titre: `n${id}`, telephone: null, email: null, adresse: null, detail: null, ancien });

describe('🔴 la liste unique de l’accueil (retouche d’Arno du 17/10/2026)', () => {
  it('propriétaires, locataires, syndics, biens ; puis les ANCIENS, dans le même ordre de types, tout en bas', () => {
    const r = aplatirResultats({
      proprietaires: [l(1), l(2, true)], locataires: [l(3, true), l(4)], syndics: [l(5)], biens: [l(6, true), l(7)], tronque: false,
    });
    expect(r.map((x) => `${x.groupe}:${x.id}`)).toEqual([
      'proprietaires:1', 'locataires:4', 'syndics:5', 'biens:7', 'proprietaires:2', 'locataires:3', 'biens:6']);
  });
  it('une réponse incomplète ne casse rien', () => {
    expect(aplatirResultats(null)).toEqual([]);
    expect(aplatirResultats({ syndics: [l(9)] }).map((x) => x.groupe)).toEqual(['syndics']);
  });
});
