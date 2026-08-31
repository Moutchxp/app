import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BlocCompletude } from './BlocCompletude';

/**
 * Q4 — le bloc « Complétude » demandait 2 clics dans l'encart (un pli DANS le pli de famille). `sansPli` supprime le pli interne :
 * sous la famille de l'encart, le CORPS s'affiche d'un seul geste, sans 2e en-tête ; en « Analyse et projection » (défaut), le bloc
 * reste AUTONOME avec son propre pli. renderToStaticMarkup : useEffect ne tourne pas → état initial « chargement » (« Analyse des
 * pièces… ») pour le corps, et BlocRepliable rend un bouton `aria-expanded` sans monter son enfant (paresseux).
 */
describe('Q4 — BlocCompletude : sansPli (encart, 1 geste) vs pli autonome (Analyse)', () => {
  it('sansPli → corps DIRECT, aucun 2e pli ni titre en doublon', () => {
    const h = renderToStaticMarkup(createElement(BlocCompletude, { dossierId: 1, sansPli: true }));
    expect(h).toContain('Analyse des pièces'); // le corps est monté d'emblée (1 seul geste = l'ouverture de la famille)
    expect(h).not.toContain('Complétude des pièces et relances semi-automatiques'); // pas de 2e en-tête (doublon avec le titre de famille)
    expect(h).not.toContain('aria-expanded'); // aucun BlocRepliable interne → aucun 2e bouton de dépliage
  });

  it('défaut (Analyse) → pli AUTONOME conservé (titre du pli, corps NON monté tant que replié)', () => {
    const h = renderToStaticMarkup(createElement(BlocCompletude, { dossierId: 1 }));
    expect(h).toContain('Complétude des pièces et relances semi-automatiques'); // titre du pli propre
    expect(h).toContain('aria-expanded'); // BlocRepliable présent = le pli subsiste
    expect(h).not.toContain('Analyse des pièces'); // corps paresseux : non monté avant le 1er dépliage
  });
});
