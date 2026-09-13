import { describe, it, expect } from 'vitest';
import { etatCommuneRail, communeSelectionnable } from './carteRail';

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
