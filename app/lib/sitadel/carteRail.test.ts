import { describe, it, expect } from 'vitest';
import { etatCommuneRail, communeSelectionnable, actionAuClic } from './carteRail';

/**
 * Lot 2 — état d'une commune vu depuis la carte d'un rail (dérivé du canal). PUR, comportement seul (aucune couleur).
 */
describe('etatCommuneRail — 4 états dérivés du canal', () => {
  it('canal du rail courant → « courant »', () => {
    expect(etatCommuneRail('email', 'email')).toBe('courant');
    expect(etatCommuneRail('formulaire', 'formulaire')).toBe('courant');
  });
  it('canal de l’autre process → « autre »', () => {
    expect(etatCommuneRail('formulaire', 'email')).toBe('autre');
    expect(etatCommuneRail('email', 'formulaire')).toBe('autre');
  });
  it('canal délibéré hors process (courrier/inconnu) → « horsProcess »', () => {
    expect(etatCommuneRail('courrier', 'email')).toBe('horsProcess');
    expect(etatCommuneRail('inconnu', 'formulaire')).toBe('horsProcess');
  });
  it('aucun canal (null/absent) → « nonAffecte »', () => {
    expect(etatCommuneRail(null, 'email')).toBe('nonAffecte');
    expect(etatCommuneRail(undefined, 'formulaire')).toBe('nonAffecte');
  });
});

describe('communeSelectionnable — seul « horsProcess » est non sélectionnable', () => {
  it('horsProcess → false', () => { expect(communeSelectionnable('horsProcess')).toBe(false); });
  it('courant / autre / nonAffecte → true', () => {
    expect(communeSelectionnable('courant')).toBe(true);
    expect(communeSelectionnable('autre')).toBe(true);
    expect(communeSelectionnable('nonAffecte')).toBe(true);
  });
});

describe('Lot C — actionAuClic : le mode décide (repos → ouvrir la fiche, édition → sélectionner)', () => {
  it('AU REPOS, ouverture câblée → « ouvrir » pour TOUTE commune (même hors process, justement celles à renseigner)', () => {
    expect(actionAuClic(false, true, true)).toBe('ouvrir');   // sélectionnable
    expect(actionAuClic(false, false, true)).toBe('ouvrir');  // hors process → ouvrable au repos
  });
  it('AU REPOS sans ouverture câblée → « inerte » (comportement historique : carte au repos non actionnable)', () => {
    expect(actionAuClic(false, true, false)).toBe('inerte');
    expect(actionAuClic(false, false, false)).toBe('inerte');
  });
  it('EN ÉDITION → « basculer » si sélectionnable, sinon « inerte » ; JAMAIS « ouvrir » (le clic sélectionne)', () => {
    expect(actionAuClic(true, true, true)).toBe('basculer');   // ouverture câblée ignorée en édition
    expect(actionAuClic(true, true, false)).toBe('basculer');
    expect(actionAuClic(true, false, true)).toBe('inerte');    // hors process : non sélectionnable, et on n'ouvre pas en édition
  });
});
