import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChoixOffre } from './ChoixOffre';

/**
 * ChoixOffre (Commit D1) — rendu STATIQUE en Node (aucun DOM requis) pour prouver, sans jsdom :
 *  (d) chaque offre est un vrai <button type="button"> → activable au tap ET au clavier (Entrée/Espace, gérés par la
 *      plateforme) : le slider n'est jamais le seul moyen de choisir ;
 *  (c) l'écran de choix ne porte AUCUNE case de consentement ;
 *  — le slider est un PLUS `aria-hidden` (le clavier/lecteur d'écran passe par les boutons).
 */
function html(): string {
  return renderToStaticMarkup(createElement(ChoixOffre, { onUnique: () => {}, onIllimite: () => {} }));
}

describe('ChoixOffre — écran de choix (Commit D1)', () => {
  it('(d) chaque offre est un vrai <button type="button"> (tap + clavier), libellés présents', () => {
    const h = html();
    const boutons = h.match(/<button[^>]*type="button"/g) ?? [];
    expect(boutons.length).toBeGreaterThanOrEqual(2); // les deux offres sont de vrais boutons
    expect(h).toContain('Test unique');
    expect(h).toContain('Test illimité');
  });

  it('(c) AUCUNE case de consentement sur l’écran de choix', () => {
    const h = html();
    expect(h).not.toContain('type="checkbox"');
    expect(/consent/i.test(h)).toBe(false);
  });

  it('le slider est un PLUS aria-hidden (accessibilité assurée par les boutons)', () => {
    const h = html();
    expect(h).toContain('aria-hidden="true"');
  });
});
