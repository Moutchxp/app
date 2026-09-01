import { describe, it, expect } from 'vitest';
import { styleMentionEnCours } from './CommutateurProcess';

/**
 * LOT 36 — la mention « N demande(s) en cours » d'un bouton passe en ROUGE + GRAS dès que le compteur est > 0, par bouton et
 * indépendamment de l'autre. À 0, apparence inchangée (aucun style ajouté). Rouge = la valeur d'alerte déjà employée ailleurs.
 */
describe('styleMentionEnCours', () => {
  it('compteur à 0 → PAS de rouge (aucun style ajouté, apparence muette conservée)', () => {
    expect(styleMentionEnCours(0)).toBeUndefined();
  });

  it('compteur à 1 → ROUGE + GRAS (couleur d’alerte + gras, pas la couleur seule)', () => {
    expect(styleMentionEnCours(1)).toEqual({ color: 'var(--color-svv-red)', fontWeight: 700 });
  });

  it('compteur élevé → ROUGE + GRAS (dès que > 0)', () => {
    expect(styleMentionEnCours(2)).toEqual({ color: 'var(--color-svv-red)', fontWeight: 700 });
  });

  it('DEUX boutons indépendants : l’un à 0, l’autre à 2 → seul le second est rouge', () => {
    const email = styleMentionEnCours(0);        // E-mail : 0 en cours
    const teleservice = styleMentionEnCours(2);  // Téléservice : 2 en cours
    expect(email).toBeUndefined();
    expect(teleservice).toEqual({ color: 'var(--color-svv-red)', fontWeight: 700 });
  });

  it('la couleur retenue est le rouge d’alerte EXISTANT (var(--color-svv-red)), aucun rouge de plus', () => {
    expect(styleMentionEnCours(1)?.color).toBe('var(--color-svv-red)');
  });
});
