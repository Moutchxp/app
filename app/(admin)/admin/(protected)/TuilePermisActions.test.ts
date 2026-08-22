import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContenuTuilePermis } from './TuilePermisActions';

/**
 * PASTILLES (tuile home) — rendu PUR. Sans action → sous-titre IDENTIQUE à aujourd'hui (aucune pastille, aucune troncature).
 * Avec action → sous-titre tronqué à une ligne + pastille du cumul + « Actions en attente ».
 */
const h = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const DESC = 'Veille des autorisations d’urbanisme (Sitadel).';

describe('PASTILLES — tuile « Permis de construire »', () => {
  it('cumul 0 → rendu ACTUEL inchangé (sous-titre simple, sans pastille ni troncature)', () => {
    const m = h(createElement(ContenuTuilePermis, { desc: DESC, cumul: 0 }));
    expect(m).toBe(`<span class="svv-grille-desc">${DESC}</span>`);
    expect(m).not.toContain('en attente');
    expect(m).not.toContain('clamp');
  });
  it('cumul > 0 → sous-titre tronqué à UNE ligne + pastille + « Actions en attente »', () => {
    const m = h(createElement(ContenuTuilePermis, { desc: DESC, cumul: 7 }));
    expect(m).toContain('svv-grille-desc--clamp'); // troncature propre à une ligne
    expect(m).toContain(DESC);                      // le sous-titre reste présent (tronqué visuellement, jamais coupé au mot)
    expect(m).toContain('aria-label="7 actions en attente"');
    expect(m).toContain('Actions en attente');
  });
  it('au-delà de 99 → « 99+ » dans la tuile aussi', () => {
    expect(h(createElement(ContenuTuilePermis, { desc: DESC, cumul: 240 }))).toContain('99+');
  });
});
