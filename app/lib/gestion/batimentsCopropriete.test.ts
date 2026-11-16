import { describe, expect, it } from 'vitest';
import { avertissementBatiment, avertissementsDesBatiments, batimentDe, menuBatiments, MOTIF_CHIFFRES, MOTIF_LETTRES, MOTIF_TOUS_LIBRES, nomenclatureDe, refusDesBatiments, sorteBatiment, type BatimentConnu } from './batimentsCopropriete';

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
});

describe('🔴 (lot D) le mélange n’est plus refusé : il est AVERTI, et accepté une fois confirmé', () => {
  const LETTRES: BatimentConnu[] = [{ cle: 'a', libelle: 'A', sorte: 'lettre' }, { cle: 'b', libelle: 'B', sorte: 'lettre' }, { cle: 'cote cour', libelle: 'Côté cour', sorte: 'libre' }];
  const LIBRES: BatimentConnu[] = [{ cle: 'cote cour', libelle: 'Côté cour', sorte: 'libre' }, { cle: 'cote rue', libelle: 'Côté rue', sorte: 'libre' }];
  it('1. suit la numérotation en place : aucune fenêtre', () => {
    expect(avertissementBatiment('C', 'lettres', LETTRES)).toBeNull();
    expect(avertissementBatiment('3', 'chiffres', [{ cle: '1', libelle: '1', sorte: 'chiffre' }])).toBeNull();
  });
  it('2. ne la suit pas : la fenêtre (autre numérotation), avec les intitulés déjà utilisés', () => {
    expect(avertissementBatiment('2', 'lettres', LETTRES)).toEqual({ libelle: '2', sorte: 'chiffre', raison: 'autre_numerotation', reference: 'lettres', intitules: ['A', 'B', 'Côté cour'], motif: MOTIF_LETTRES });
    expect(avertissementBatiment('C', 'chiffres', [{ cle: '1', libelle: '1', sorte: 'chiffre' }])?.motif).toBe(MOTIF_CHIFFRES);
  });
  it('3. tous les autres sont des intitulés personnalisés : la fenêtre le dit (lettre ou chiffre)', () => {
    expect(avertissementBatiment('A', null, LIBRES)).toMatchObject({ raison: 'tous_libres', sorte: 'lettre', intitules: ['Côté cour', 'Côté rue'], motif: MOTIF_TOUS_LIBRES });
  });
  it('4. un intitulé personnalisé parmi des lettres : aucune fenêtre ; un bâtiment déjà connu non plus ; le tout premier non plus', () => {
    expect(avertissementBatiment('Côté jardin', 'lettres', LETTRES)).toBeNull();
    expect(avertissementBatiment('Bât. B', 'chiffres', LETTRES)).toBeNull();
    expect(avertissementBatiment('A', null, [])).toBeNull();
  });
  it('5. la référence reste celle enregistrée ; une exception confirmée ne la change pas ; le premier fixe la référence s’il n’y en avait pas', () => {
    expect(avertissementsDesBatiments(['2', 'C'], 'lettres', LETTRES).map((x) => x.avertissement?.raison ?? null)).toEqual(['autre_numerotation', null]);
    expect(avertissementsDesBatiments(['A', '2'], null, []).map((x) => x.avertissement?.raison ?? null)).toEqual([null, 'autre_numerotation']);
  });
  it('6. le serveur : refus SANS confirmation (le même message clair), permis AVEC ; un nom vide reste refusé', () => {
    expect(refusDesBatiments([{ libelle: '2' }], 'lettres', LETTRES)).toBe(MOTIF_LETTRES);
    expect(refusDesBatiments([{ libelle: '2', confirme: true }], 'lettres', LETTRES)).toBeNull();
    expect(refusDesBatiments([{ libelle: 'A' }], null, LIBRES)).toBe(MOTIF_TOUS_LIBRES);
    expect(refusDesBatiments([{ libelle: 'Côté cour' }, { libelle: 'C' }], 'lettres', LETTRES)).toBeNull();
    expect(refusDesBatiments([{ libelle: '  ' }], null, [])).toBe('Donnez un nom au bâtiment ou à la cage d’escalier.');
  });
});

describe('le menu sous le champ', () => {
  it('lettres et chiffres dans l’ordre, puis les intitulés libres ; sans doublon', () => {
    const m = menuBatiments([{ cle: 'b', libelle: 'B', sorte: 'lettre' }, { cle: 'cote cour', libelle: 'Côté cour', sorte: 'libre' }, { cle: 'a', libelle: 'A', sorte: 'lettre' }, { cle: 'b', libelle: 'B', sorte: 'lettre' }]);
    expect(m.map((x) => x.libelle)).toEqual(['A', 'B', 'Côté cour']);
  });
});
