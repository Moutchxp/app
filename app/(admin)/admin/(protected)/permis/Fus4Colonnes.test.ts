import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { libelleOrigine, accuseRecu } from './DemandesRendu';
import { RefMairieCellule, EditeurReferenceMairie } from './RefMairieCellule';

/**
 * FUS-4 — colonnes « Origine » (libellé) + « Réf. mairie » (éditable) de l'onglet « En cours ». libelleOrigine et accuseRecu
 * sont PURS ; RefMairieCellule est testée par son rendu STATIQUE (états initiaux). Aucune DB, aucun réseau.
 */
describe('FUS-4 — libelleOrigine (① colonne Origine)', () => {
  it('formulaire → « Téléservice », email → « Mail », repli = valeur brute / tiret', () => {
    expect(libelleOrigine('formulaire')).toBe('Téléservice');
    expect(libelleOrigine('email')).toBe('Mail');
    expect(libelleOrigine('courrier')).toBe('courrier');
    expect(libelleOrigine(null)).toBe('—');
  });
});

describe('FUS-4 — accuseRecu (décision 1 : état DÉRIVÉ, jamais stocké)', () => {
  it('vrai si une référence est présente OU si un message accuse est rattaché ; faux sinon', () => {
    expect(accuseRecu({ referencesMairie: ['SLC1'], aAccuse: false })).toBe(true);  // référence seule
    expect(accuseRecu({ referencesMairie: [], aAccuse: true })).toBe(true);          // accusé seul
    expect(accuseRecu({ referencesMairie: ['SLC1'], aAccuse: true })).toBe(true);
    expect(accuseRecu({ referencesMairie: [], aAccuse: false })).toBe(false);        // rien
  });
  it('retirer la référence fait retomber l’état si aucun message accuse (revient TOUT SEUL)', () => {
    expect(accuseRecu({ referencesMairie: [], aAccuse: false })).toBe(false);
  });
});

const noop = async () => null;

describe('FUS — RefMairieCellule / EditeurReferenceMairie : RÈGLE « une seule référence » (add SEULEMENT si 0)', () => {
  it('AUCUNE référence → champ + « ajouter » VISIBLES (le SEUL cas) ; aucun modifier/effacer', () => {
    const h = renderToStaticMarkup(createElement(RefMairieCellule, { references: [], onAjouter: noop, onModifier: noop, onSupprimer: noop }));
    expect(h).toContain('Ajouter une référence mairie'); // aria-label du champ de saisie
    expect(h).toContain('ajouter');
    expect(h).not.toContain('modifier');
    expect(h).not.toContain('Effacer la référence');
    expect(h).not.toContain('accusé'); // « accusé reçu » vit dans « Retour mairie », pas ici
  });

  it('référence PRÉSENTE → SEULEMENT « modifier » + « effacer » ; champ « ajouter » PAS rendu (pas grisé — absent)', () => {
    const h = renderToStaticMarkup(createElement(RefMairieCellule, { references: ['SLC260810440700'], onAjouter: noop, onModifier: noop, onSupprimer: noop }));
    expect(h).toContain('SLC260810440700');
    expect(h).toContain('modifier');
    expect(h).toContain('Effacer la référence SLC260810440700'); // aria-label de l’effacement
    expect(h).not.toContain('Ajouter une référence mairie');  // champ NON rendu tant qu'une référence existe (plus d'empilement)
    expect(h).not.toContain('placeholder="ajouter une référence"');
    expect(h).not.toContain('aucune');
  });

  it('EditeurReferenceMairie (FOYER PARTAGÉ, hors cellule) : même règle → add si vide, modifier/effacer si présent', () => {
    const vide = renderToStaticMarkup(createElement(EditeurReferenceMairie, { references: [], onAjouter: noop, onModifier: noop, onSupprimer: noop }));
    expect(vide).toContain('Ajouter une référence mairie');
    expect(vide).not.toContain('modifier');
    const pleine = renderToStaticMarkup(createElement(EditeurReferenceMairie, { references: ['REF-1'], onAjouter: noop, onModifier: noop, onSupprimer: noop }));
    expect(pleine).toContain('modifier');
    expect(pleine).not.toContain('Ajouter une référence mairie');
  });
});
