import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChoixOffre } from './ChoixOffre';
import type { Choix } from './lib/tunnel/choixOffre';

/**
 * ChoixOffre (REFONTE parcours de fin) — rendu STATIQUE en Node (aucun DOM) pour prouver, sans jsdom :
 *  - chaque offre est un vrai <button aria-pressed> (tap + clavier) : le slider n'est jamais le seul moyen de choisir ;
 *  - AUCUNE case de consentement ; le slider est un PLUS `aria-hidden` ;
 *  - la SÉLECTION est reflétée (aria-pressed) et le VERROU (test illimité) désactive les boutons ;
 *  - le nouveau libellé « Création de compte en 1 clic » remplace « avec compte ».
 */
function html(props?: { selection?: Choix | null; verrouille?: boolean }): string {
  return renderToStaticMarkup(
    createElement(ChoixOffre, {
      selection: props?.selection ?? null,
      onSelectionner: () => {},
      verrouille: props?.verrouille ?? false,
    }),
  );
}

describe('ChoixOffre — écran de choix (refonte : sélection, pas d’avance auto)', () => {
  it('chaque offre est un vrai <button> (tap + clavier), libellés présents, nouveau pill « Création de compte en 1 clic »', () => {
    const h = html();
    const boutons = h.match(/<button/g) ?? [];
    expect(boutons.length).toBeGreaterThanOrEqual(2);
    expect(h).toContain('Test unique');
    expect(h).toContain('Test illimité');
    expect(h).toContain('Création de compte en 1 clic');
    expect(h).not.toContain('avec compte'); // ancien libellé retiré
  });

  it('AUCUNE case de consentement sur l’écran de choix', () => {
    const h = html();
    expect(h).not.toContain('type="checkbox"');
    expect(/consent/i.test(h)).toBe(false);
  });

  it('le slider est un PLUS aria-hidden (accessibilité assurée par les boutons)', () => {
    const h = html();
    expect(h).toContain('aria-hidden="true"');
  });

  it('SÉLECTION reflétée : selection="illimite" → l’offre illimité porte aria-pressed="true"', () => {
    const h = html({ selection: 'illimite' });
    // le bouton illimité (celui qui contient le pill) est pressé
    expect(/<button[^>]*aria-pressed="true"[\s\S]*Création de compte en 1 clic/.test(h)).toBe(true);
  });

  it('VERROU : verrouille=true → les boutons d’offre sont désactivés (plus de retour vers unique)', () => {
    const h = html({ selection: 'illimite', verrouille: true });
    const desactives = h.match(/<button[^>]*disabled/g) ?? [];
    expect(desactives.length).toBeGreaterThanOrEqual(2); // les 2 offres désactivées
  });
});
