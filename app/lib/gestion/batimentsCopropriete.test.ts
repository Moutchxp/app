import { describe, expect, it } from 'vitest';
import { batimentDe, menuBatiments, MOTIF_CHIFFRES, MOTIF_LETTRES, nomenclatureDe, refusBatiment, refusDesBatiments, sorteBatiment } from './batimentsCopropriete';

/** 🔴🔴 Arno (16/11/2026, fiche Copropriété, lot 3) — les bâtiments d'une copropriété : lettres OU chiffres, intitulés libres en plus. */
describe('la sorte d’un intitulé', () => {
  it('« Bât. B » = « B » = « bâtiment b » : une lettre ; « 2 » : un chiffre ; « Côté cour » : libre ; vide : rien', () => {
    expect([sorteBatiment('Bât. B'), sorteBatiment('bâtiment b'), sorteBatiment('B'), sorteBatiment('2'), sorteBatiment('Bât 12'), sorteBatiment('Côté cour'), sorteBatiment('  ')])
      .toEqual(['lettre', 'lettre', 'lettre', 'chiffre', 'chiffre', 'libre', null]);
    expect(batimentDe('bât. b')).toEqual({ cle: 'b', libelle: 'B', sorte: 'lettre' });
    expect(batimentDe('Côté rue')).toEqual({ cle: 'cote rue', libelle: 'Côté rue', sorte: 'libre' });
  });
});

describe('la règle de la copropriété', () => {
  it('enregistrée : elle seule ; sinon celle des bâtiments connus s’ils sont tous lettres ou tous chiffres ; libres ou mélangés : aucune', () => {
    expect(nomenclatureDe('chiffres', [{ sorte: 'lettre' }])).toBe('chiffres');
    expect(nomenclatureDe(null, [{ sorte: 'lettre' }, { sorte: 'libre' }])).toBe('lettres');
    expect(nomenclatureDe(null, [{ sorte: 'chiffre' }])).toBe('chiffres');
    expect(nomenclatureDe(null, [{ sorte: 'libre' }])).toBeNull();
    expect(nomenclatureDe(null, [{ sorte: 'lettre' }, { sorte: 'chiffre' }])).toBeNull();
  });
  it('🔴 le mélange est refusé avec un message clair ; un intitulé libre est toujours permis ; un bâtiment déjà connu aussi', () => {
    expect(refusBatiment('1', 'lettres')).toBe(MOTIF_LETTRES);
    expect(refusBatiment('C', 'chiffres')).toBe(MOTIF_CHIFFRES);
    expect(refusBatiment('Côté cour', 'lettres')).toBeNull();
    expect(refusBatiment('C', 'lettres')).toBeNull();
    expect(refusBatiment('2', 'lettres', [{ cle: '2' }])).toBeNull();
    expect(refusBatiment('  ', null)).toBe('Donnez un nom au bâtiment ou à la cage d’escalier.');
    expect(MOTIF_LETTRES).toContain('LETTRES (A, B, C…)');
  });
  it('le PREMIER bâtiment en lettre ou en chiffre fixe la règle (un libre ne la fixe pas) — même dans une seule saisie', () => {
    expect(refusDesBatiments(['Côté cour', 'A', 'B'], null, [])).toBeNull();
    expect(refusDesBatiments(['Côté cour', 'A', '2'], null, [])).toBe(MOTIF_LETTRES);
    expect(refusDesBatiments(['1', 'B'], null, [])).toBe(MOTIF_CHIFFRES);
  });
});

describe('le menu sous le champ', () => {
  it('lettres et chiffres dans l’ordre, puis les intitulés libres ; sans doublon', () => {
    const m = menuBatiments([{ cle: 'b', libelle: 'B', sorte: 'lettre' }, { cle: 'cote cour', libelle: 'Côté cour', sorte: 'libre' }, { cle: 'a', libelle: 'A', sorte: 'lettre' }, { cle: 'b', libelle: 'B', sorte: 'lettre' }]);
    expect(m.map((x) => x.libelle)).toEqual(['A', 'B', 'Côté cour']);
  });
});
