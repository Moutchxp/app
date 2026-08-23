import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContenuTuileSources } from './TuileSourcesActions';

/**
 * F7 — rendu PUR du sous-titre de la tuile « Sources de données » + pastille. total<=0 → sous-titre seul (rendu ACTUEL) ;
 * total>0 → sous-titre tronqué + pastille + libellé accessible « N mises à jour de base de données disponibles ».
 */
const h = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe('ContenuTuileSources', () => {
  it('total 0 → sous-titre seul, AUCUNE pastille (jamais « 0 »)', () => {
    const m = h(createElement(ContenuTuileSources, { desc: 'Fraîcheur des données.', total: 0 }));
    expect(m).toContain('Fraîcheur des données.');
    expect(m).not.toContain('Mises à jour disponibles');
    expect(m).not.toContain('aria-label');
  });

  it('total 2 → pastille + libellé accessible pluriel + texte visible', () => {
    const m = h(createElement(ContenuTuileSources, { desc: 'Fraîcheur des données.', total: 2 }));
    expect(m).toContain('>2<');
    expect(m).toContain('aria-label="2 mises à jour de base de données disponibles"');
    expect(m).toContain('Mises à jour disponibles');
  });

  it('total 1 → libellé accessible au SINGULIER', () => {
    const m = h(createElement(ContenuTuileSources, { desc: 'x', total: 1 }));
    expect(m).toContain('aria-label="1 mise à jour de base de données disponible"');
  });
});
