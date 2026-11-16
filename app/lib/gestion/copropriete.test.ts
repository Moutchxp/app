import { describe, expect, it } from 'vitest';
import { ALERTE_DESACCORD, biensEnDesaccord, cherchableDe, filtrerCoproprietes, horsDansLaListe, estHorsCopropriete, nomAffiche, titreFicheCopropriete, TITRE_COPROPRIETE, TITRE_HORS_COPROPRIETE } from './copropriete';
import { CATEGORIES_COPROPRIETE, CATEGORIES_IMMEUBLE, categorieDe, libelleCategorieImmeuble, validerSyndic, versFormulaireImmeuble } from './syndics';
import { roleImmeuble } from './partiesSyndic';

/** 🔴🔴 Arno (16/11/2026, 476) — la fiche Copropriété, séparée du syndic : le socle (règles pures, statut « Copropriétaire »). */
describe('« Bien hors copropriété » : l’immeuble entier ; dès le départ si le bien est noté « pas en copropriété »', () => {
  it('le titre et le bouton', () => {
    expect(titreFicheCopropriete(false)).toBe(TITRE_COPROPRIETE);
    expect(titreFicheCopropriete(true)).toBe(TITRE_HORS_COPROPRIETE);
    expect(TITRE_HORS_COPROPRIETE).toBe('Bien hors copropriété');
  });
  it('la fiche le dit, ou le bien (461) le dit avant toute fiche ; « oui » ou non renseigné : copropriété', () => {
    expect(estHorsCopropriete({ horsCopropriete: true }, true)).toBe(true);
    expect(estHorsCopropriete(null, false)).toBe(true);
    expect(estHorsCopropriete({ horsCopropriete: false }, false)).toBe(true);
    expect(estHorsCopropriete({ horsCopropriete: false }, null)).toBe(false);
    expect(estHorsCopropriete(null, true)).toBe(false);
    expect(estHorsCopropriete(null, undefined)).toBe(false);
  });
  it('des biens qui se contredisent : alerte (rien n’est corrigé tout seul) ; non renseignés : pas de désaccord', () => {
    expect(biensEnDesaccord([{ copropriete: true }, { copropriete: false }])).toBe(true);
    expect(biensEnDesaccord([{ copropriete: true }, { copropriete: null }])).toBe(false);
    expect(biensEnDesaccord([{ copropriete: null }, { copropriete: false }])).toBe(false);
    expect(ALERTE_DESACCORD).toContain('rien n’est corrigé tout seul');
  });
  it('le nom affiché : le nom donné, sinon le libellé de l’immeuble', () => {
    expect(nomAffiche({ nom: 'Résidence Les Tilleuls', libelle: '12 rue des Lilas' })).toBe('Résidence Les Tilleuls');
    expect(nomAffiche({ nom: '  ', libelle: '12 rue des Lilas' })).toBe('12 rue des Lilas');
    expect(nomAffiche({ nom: null, libelle: '12 rue des Lilas' })).toBe('12 rue des Lilas');
  });
});

describe('le statut « Copropriétaire » des contacts de l’immeuble', () => {
  it('son mot partout (fiche, parties, tâches, anti-doublon) : une seule fonction', () => {
    expect(libelleCategorieImmeuble('coproprietaire', null)).toBe('Copropriétaire');
    expect(libelleCategorieImmeuble('gardien', 'x')).toBe('Gardien');
    expect(libelleCategorieImmeuble('conseil_syndical', null)).toBe('Conseil syndical');
    expect(libelleCategorieImmeuble('personnalise', ' Femme de ménage ')).toBe('Femme de ménage');
    expect(roleImmeuble('coproprietaire', null)).toBe('Copropriétaire');
    expect(roleImmeuble('personnalise', 'habitant')).toBe('Habitant');
  });
  it('accepté par la validation et relu dans sa pilule ; la fiche syndic garde ses trois pilules (rien d’ajouté avant le lot 2)', () => {
    const v = validerSyndic({ nom: 'Cabinet', adresse: '1 rue A', codePostal: '75001', ville: 'Paris', contacts: [], immeubles: [],
      contactsImmeuble: { immeuble: '12 rue des Lilas', contacts: [{ categorie: 'coproprietaire', civilite: 'Mme', prenom: 'Léa', nom: 'Martin', coordonnees: [] }] } });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.syndic.contactsImmeuble?.contacts[0].categorie).toBe('coproprietaire');
    expect(categorieDe('Copropriétaire')).toBe('coproprietaire');
    expect(versFormulaireImmeuble([{ id: 1, categorie: 'coproprietaire', libelle: null, civilite: 'Mme', prenom: 'Léa', nom: 'Martin', note: null, coordonnees: [] }])[0].titreChoix).toBe('Copropriétaire');
    expect(CATEGORIES_IMMEUBLE).toEqual(['Gardien', 'Conseil syndical', 'Personnalisé']);
    expect(CATEGORIES_COPROPRIETE).toEqual(['Gardien', 'Copropriétaire', 'Conseil syndical', 'Personnalisé']);
  });
});

describe('🔴 (lot 4) la liste « Copropriétés »', () => {
  it('« Bien hors copropriété » dans la liste : la fiche le dit, ou tous les biens notés le disent ; désaccord ou rien : non', () => {
    expect(horsDansLaListe(true, [true])).toBe(true);
    expect(horsDansLaListe(false, [false, null])).toBe(true);
    expect(horsDansLaListe(false, [false, true])).toBe(false);
    expect(horsDansLaListe(false, [null])).toBe(false);
    expect(horsDansLaListe(false, [])).toBe(false);
  });
  it('la recherche : chaque mot, sans accents ni casse, dans le nom, les adresses ou le syndic', () => {
    const l = [{ cherchable: cherchableDe(['Résidence Les Tilleuls', '12 rue des Lilas, 75011 Paris', 'Cabinet A']) }, { cherchable: cherchableDe(['80 rue de Normandie', null]) }];
    expect(filtrerCoproprietes(l, 'tilleuls lilas')).toHaveLength(1);
    expect(filtrerCoproprietes(l, 'RÉSIDENCE cabinet')).toHaveLength(1);
    expect(filtrerCoproprietes(l, 'rue')).toHaveLength(2);
    expect(filtrerCoproprietes(l, '  ')).toHaveLength(2);
    expect(filtrerCoproprietes(l, 'nice')).toHaveLength(0);
  });
});
