import { describe, it, expect } from 'vitest';
import { cibleDeuxiemePosition } from './recentragePieces';

/**
 * RECENTRAGE-1 (②) — cibleDeuxiemePosition : place une pièce en 2ᵉ position (une hauteur d'item au-dessus), avec les cas limites d'Arno.
 * On raisonne en pixels : hauteur d'item 40, fenêtre (clientHeight) 240, contenu (scrollHeight) variable.
 */
describe('RECENTRAGE-1 — cibleDeuxiemePosition (2ᵉ position, cas limites)', () => {
  const H = 40;        // hauteur d'un item
  const FENETRE = 240; // clientHeight de la liste bornée

  it('pièce au milieu → une hauteur d’item au-dessus (2ᵉ position)', () => {
    // item à 400px du haut du contenu, contenu 1000px → cible = 400 − 40 = 360 (dans [0 ; 760])
    expect(cibleDeuxiemePosition(400, H, 1000, FENETRE)).toBe(360);
  });

  it('1ʳᵉ pièce (collée en haut) → cible clampée à 0 (reste en 1ʳᵉ position, rien à placer au-dessus)', () => {
    expect(cibleDeuxiemePosition(0, H, 1000, FENETRE)).toBe(0);
    expect(cibleDeuxiemePosition(10, H, 1000, FENETRE)).toBe(0); // 10 − 40 < 0 → 0
  });

  it('fin de liste (pas assez d’items en dessous) → cible clampée au défilement max, pièce visible même si pas exactement 2ᵉ', () => {
    // contenu 1000, fenêtre 240 → maxScroll = 760. Item tout en bas à 980 → brut 940 → clampé 760.
    expect(cibleDeuxiemePosition(980, H, 1000, FENETRE)).toBe(760);
  });

  it('liste trop courte pour défiler (contenu ≤ fenêtre) → null (ne rien faire)', () => {
    expect(cibleDeuxiemePosition(50, H, 200, FENETRE)).toBeNull();   // 200 < 240
    expect(cibleDeuxiemePosition(50, H, 240, FENETRE)).toBeNull();   // égal → maxScroll 0 → null
  });

  it('juste défilable (maxScroll > 0 minime) → jamais négatif, jamais au-delà du max', () => {
    // contenu 250, fenêtre 240 → maxScroll = 10. Item à 100 → brut 60 → clampé 10.
    expect(cibleDeuxiemePosition(100, H, 250, FENETRE)).toBe(10);
    // item à 20 → brut −20 → 0.
    expect(cibleDeuxiemePosition(20, H, 250, FENETRE)).toBe(0);
  });
});
