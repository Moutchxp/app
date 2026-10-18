import { describe, expect, it } from 'vitest';
import {
  carteEstComplete, ligneDeManques, manquesAAvertir, manquesDeCompletude, MOTIF_DERNIERE_COMPLETE_MODIFICATION,
  MOTIF_DERNIERE_COMPLETE_SUPPRESSION, titreSansCarteComplete, verdictFamille,
} from './carteComplete';
import { manquesClientLocation } from '../location/cartesLocation';

/** La carte complète et sa famille (Arno, 18/10/2026) — la règle, sans base ni écran. */
const tel = { sorte: 'telephone', valeur: '06 12 34 56 78' };
const mail = { sorte: 'email', valeur: 'a@b.test' };

describe('carte complète = nom + un téléphone + un e-mail (adresse facultative)', () => {
  it('manques et complétude', () => {
    expect(manquesDeCompletude({ nom: 'Dupont', coordonnees: [tel, mail] })).toEqual([]);
    expect(carteEstComplete({ nom: 'Dupont', coordonnees: [tel, mail] })).toBe(true);
    expect(manquesDeCompletude({ nom: ' ', coordonnees: [] })).toEqual(['Nom manquant', 'Téléphone manquant', 'E-mail manquant']);
    expect(manquesDeCompletude({ nom: 'Dupont', coordonnees: [{ sorte: 'telephone', valeur: '  ' }, mail] })).toEqual(['Téléphone manquant']);
    // L'alerte ne parle que du téléphone et de l'e-mail : le nom, lui, bloque.
    expect(manquesAAvertir({ nom: '', coordonnees: [mail] })).toEqual(['Téléphone manquant']);
  });
  it('la PREMIÈRE carte client de la Location : téléphone ET e-mail ; les suivantes : le nom seulement', () => {
    expect(manquesClientLocation({ nom: 'Dupont', coordonnees: [tel] as never }, true)).toEqual({ email: 'Première carte client : un e-mail est obligatoire.' });
    expect(manquesClientLocation({ nom: 'Dupont', coordonnees: [mail] as never }, true)).toEqual({ telephone: 'Première carte client : un téléphone est obligatoire.' });
    expect(manquesClientLocation({ nom: 'Dupont', coordonnees: [tel, mail] as never }, true)).toEqual({});
    expect(manquesClientLocation({ nom: 'Dupont', coordonnees: [] }, false)).toEqual({});
    expect(manquesClientLocation({ nom: '', coordonnees: [] }, false)).toEqual({ nom: 'Le nom est obligatoire.' });
  });
});

describe('l’invariant de la famille : toujours au moins UNE carte client complète', () => {
  const famille = [{ id: 1, complete: true }, { id: 2, complete: false }];
  it('retirer ou appauvrir la DERNIÈRE carte complète : refusé, avec le motif du geste', () => {
    expect(verdictFamille(famille, 1, null, 'suppression')).toBe(MOTIF_DERNIERE_COMPLETE_SUPPRESSION);
    expect(verdictFamille(famille, 1, false, 'modification')).toBe(MOTIF_DERNIERE_COMPLETE_MODIFICATION);
  });
  it('une autre carte complète, une carte incomplète, ou une modification qui garde la carte complète : permis', () => {
    expect(verdictFamille([...famille, { id: 3, complete: true }], 1, null, 'suppression')).toBeNull();
    expect(verdictFamille(famille, 2, null, 'suppression')).toBeNull();
    expect(verdictFamille(famille, 1, true, 'modification')).toBeNull();
  });
  it('une fiche ANCIENNE sans aucune carte complète n’est jamais bloquée', () => {
    expect(verdictFamille([{ id: 1, complete: false }, { id: 2, complete: false }], 1, null, 'suppression')).toBeNull();
    expect(verdictFamille([{ id: 1, complete: false }], 1, false, 'modification')).toBeNull();
  });
  it('le bandeau', () => {
    expect(titreSansCarteComplete('propriétaire')).toBe('Aucune carte complète pour ce propriétaire');
    expect(ligneDeManques('M. MARTIN Paul', ['Téléphone manquant', 'E-mail manquant'])).toBe('M. MARTIN Paul : Téléphone manquant, e-mail manquant');
  });
});
