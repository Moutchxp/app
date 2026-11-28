// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { CLASSE_PILE_REDUITE, formatSelonMesures, mesurerFormatPile } from './formatPile';

/** 🔴🔴 Arno (28/11/2026, 10h35) — taille normale si la ligne le permet, sinon le format réduit d'aujourd'hui ; la ligne ne s'allonge jamais pour lui. */
describe('formatSelonMesures (PUR)', () => {
  const M = (hauteur: number, deborde = false, tronques = 0) => ({ hauteur, deborde, tronques });
  it('la pile tient (même hauteur, rien ne déborde, aucun texte tronqué en plus) : normal ; un demi-pixel d’arrondi ne compte pas', () => {
    expect(formatSelonMesures(M(100), M(100))).toBe('normal');
    expect(formatSelonMesures(M(100.4), M(100))).toBe('normal');
    expect(formatSelonMesures(M(100, false, 1), M(100, false, 1))).toBe('normal'); // déjà tronqué en réduit : la taille normale n'y change rien
  });
  it('la ligne s’allongerait, un cartouche sortirait de sa colonne (« Ouvrir »), un texte serait tronqué : réduit', () => {
    expect(formatSelonMesures(M(124), M(100))).toBe('reduit');
    expect(formatSelonMesures(M(100, true), M(100))).toBe('reduit');
    expect(formatSelonMesures(M(100, false, 1), M(100, false, 0))).toBe('reduit');
  });
});

describe('mesurerFormatPile', () => {
  const monter = (reduite: boolean) => {
    const ligne = document.createElement('div');
    const pile = document.createElement('span');
    pile.className = `psl-pile${reduite ? ` ${CLASSE_PILE_REDUITE}` : ''}`;
    ligne.appendChild(pile);
    return { ligne, pile };
  };
  const hauteurs = (ligne: HTMLElement, pile: HTMLElement, normale: number, reduite: number) =>
    vi.spyOn(ligne, 'getBoundingClientRect').mockImplementation(() => ({ height: pile.classList.contains(CLASSE_PILE_REDUITE) ? reduite : normale }) as DOMRect);
  it('mesure les deux formats et remet la classe d’origine (aucun changement visible pendant la mesure)', () => {
    for (const depart of [false, true]) {
      const { ligne, pile } = monter(depart);
      hauteurs(ligne, pile, 130, 100);
      expect(mesurerFormatPile(pile, ligne)).toBe('reduit');
      expect(pile.classList.contains(CLASSE_PILE_REDUITE)).toBe(depart);
      const b = monter(depart);
      hauteurs(b.ligne, b.pile, 100, 100);
      expect(mesurerFormatPile(b.pile, b.ligne)).toBe('normal');
      expect(b.pile.classList.contains(CLASSE_PILE_REDUITE)).toBe(depart);
    }
  });
});
