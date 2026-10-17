import { describe, expect, it } from 'vitest';
import { ajouterContacts, ajouterProprietaires, refusSelection, selectionParDefaut } from './rattachementProprietaires';

const p = (id: number) => ({ id, nom: `P${id}`, telephone: null, email: null, biens: [] });
const c = (id: number, email: string) => ({ id, lotId: 1, email, nom: `C${id}`, qualite: null, telephone: null, biens: [] });

describe('🔴 qui rattacher à ce bien ? — règles pures', () => {
  it('par défaut, SEULE la personne cherchée est cochée ; au moins un propriétaire pour valider', () => {
    expect(selectionParDefaut({ choisie: 2, proprietaires: [p(2), p(5)], contacts: [c(9, 'x@y.z')] })).toEqual({ proprietaires: [2], contacts: [] });
    expect(refusSelection({ proprietaires: [], contacts: [9] })).toBe('Cochez au moins une personne propriétaire.');
    expect(refusSelection({ proprietaires: [5], contacts: [] })).toBeNull();
  });
  it('jamais de doublon : même fiche, même carte, ou même adresse e-mail', () => {
    expect(ajouterProprietaires([p(1)], [p(1), p(2)]).map((x) => x.id)).toEqual([1, 2]);
    expect(ajouterContacts([c(9, 'Notaire@X.fr')], [c(9, 'a@b.c'), c(10, 'notaire@x.fr '), c(11, 'autre@x.fr')]).map((x) => x.id)).toEqual([9, 11]);
  });
});
