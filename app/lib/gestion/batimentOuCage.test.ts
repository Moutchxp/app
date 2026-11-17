import { describe, expect, it } from 'vitest';
import { batimentOuCage, LIBELLE_BATIMENT_CAGE } from './batimentsCopropriete';

/** 🔴 Arno (17/11/2026) : « « Bâtiment / cage » et « Escalier » traitent la même information » — un seul champ ; les lecteurs lisent le bâtiment / cage, repli sur l'escalier. */
describe('le bâtiment / cage d’escalier lu par les fiches, mails et documents', () => {
  it('le bâtiment / cage du bien ; à défaut, l’ancien escalier ; rien : rien', () => {
    expect(LIBELLE_BATIMENT_CAGE).toBe('Bâtiment / cage d’escalier');
    expect(batimentOuCage({ batiment: 'B', escalier: '2' })).toBe('B');
    expect(batimentOuCage({ batiment: ' ', escalier: '2' })).toBe('2');
    expect(batimentOuCage({ batiment: null, escalier: null })).toBeNull();
  });
});
