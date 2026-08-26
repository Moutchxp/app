import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LegendeParcelles, AVERTISSEMENT_ABSENCE_CALQUE } from './LegendeParcelles';

describe('PARC-3 — légende du calque parcelle', () => {
  it('la couleur NE porte PAS l’info seule : chaque pastille a un LIBELLÉ texte', () => {
    const html = renderToStaticMarkup(createElement(LegendeParcelles, { tronque: false }));
    expect(html).toContain('Parcelle citée par au moins un dossier');
    expect(html).toContain('Parcelle sans dossier rattaché');
    // Les pastilles de couleur sont décoratives (aria-hidden) — l’info est dans le libellé, pas la couleur.
    expect(html).toContain('aria-hidden="true"');
  });

  // 🔴 GARDE NON NÉGOCIABLE (PARC-3) : ce test CASSE si la mise en garde disparaît de la légende.
  it('la MISE EN GARDE « l’absence de marque ne prouve pas l’absence de permis » est présente et complète', () => {
    const html = renderToStaticMarkup(createElement(LegendeParcelles, { tronque: false }));
    expect(html).toContain('ne prouve pas l’absence de permis');
    // Les DEUX causes d’un non-rattachement doivent être nommées (sinon la mise en garde serait tronquée/trompeuse).
    expect(AVERTISSEMENT_ABSENCE_CALQUE).toContain('rapprochement cadastral');
    expect(AVERTISSEMENT_ABSENCE_CALQUE).toContain('hors du cadastre chargé');
    expect(html).toContain(AVERTISSEMENT_ABSENCE_CALQUE);
    // Jamais une affirmation d’absence sèche (« aucun permis sur cette parcelle »).
    expect(html.toLowerCase()).not.toContain('aucun permis sur cette parcelle');
  });

  it('note de troncature affichée seulement quand tronque=true', () => {
    expect(renderToStaticMarkup(createElement(LegendeParcelles, { tronque: false }))).not.toContain('zoomez');
    expect(renderToStaticMarkup(createElement(LegendeParcelles, { tronque: true }))).toContain('zoomez');
  });
});
