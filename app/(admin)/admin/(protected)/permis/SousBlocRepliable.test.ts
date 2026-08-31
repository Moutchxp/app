import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SousBlocRepliable } from './SousBlocRepliable';

/**
 * LOT-5 — repli LÉGER (1 clic) du sous-bloc « Liens, pièces et messages des réponses ». Pas d'infra DOM (env node) → on vérifie les
 * DEUX états par `defautOuvert` : REPLIÉ à l'initial (le contenu n'est PAS monté, seul le titre + le bouton), et MONTÉ une fois ouvert
 * (le contenu apparaît). Le bouton porte `aria-expanded`, et l'ouverture est un unique onClick (pas de BlocRepliable imbriqué → 1 clic).
 */
const enfant = () => createElement('span', null, 'CONTENU-SECRET');

describe('SousBlocRepliable — replié par défaut, contenu monté seulement à l’ouverture', () => {
  it('état initial (replié) : titre + bouton visibles, contenu NON monté, aria-expanded=false', () => {
    const h = renderToStaticMarkup(createElement(SousBlocRepliable, { titre: 'Liens, pièces et messages des réponses (5)', children: enfant() }));
    expect(h).toContain('Liens, pièces et messages des réponses (5)'); // le titre annonce le volume
    expect(h).toContain('aria-expanded="false"');
    expect(h).not.toContain('CONTENU-SECRET'); // 🔴 contenu PAS monté tant que replié (montage paresseux)
  });

  it('ouvert (defautOuvert) : le contenu est monté, aria-expanded=true', () => {
    const h = renderToStaticMarkup(createElement(SousBlocRepliable, { titre: 'X', defautOuvert: true, children: enfant() }));
    expect(h).toContain('aria-expanded="true"');
    expect(h).toContain('CONTENU-SECRET'); // monté après ouverture (le seul geste = l'onClick du bouton)
  });

  it('un SEUL bouton d’ouverture (pas de pli imbriqué type « Complétude »)', () => {
    const h = renderToStaticMarkup(createElement(SousBlocRepliable, { titre: 'X', children: enfant() }));
    expect((h.match(/<button/g) ?? []).length).toBe(1); // 1 seul contrôle → 1 seul clic
  });
});
