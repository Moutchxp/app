import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { TableProjection, BoutonValiderProjection, type LigneProjectionAffichee } from './ProjectionRendu';

const ligne = (over: Partial<LigneProjectionAffichee> = {}): LigneProjectionAffichee => ({
  dossierId: 11434, numDau: 'PC07512025V0035', communeNom: 'Paris 15e', natureLibelle: 'Construction neuve', nbBatiments: 2, satisfaitLe: '2026-07-01', ...over,
});

describe('PROJ-2c — rendu de la file Projection', () => {
  it('TableProjection : liste les permis ; vide → message', () => {
    expect(renderToStaticMarkup(h(TableProjection, { file: [], ouvert: null, onOuvrir: () => {}, renderDetail: () => null }))).toContain('La file est vide');
    const html = renderToStaticMarkup(h(TableProjection, { file: [ligne()], ouvert: null, onOuvrir: () => {}, renderDetail: () => null }));
    expect(html).toContain('PC07512025V0035');
    expect(html).toContain('Construction neuve');
    expect(html).toContain('Paris 15e');
  });

  it('TableProjection : ligne ouverte rend le détail (renderDetail) et masque les colonnes', () => {
    const html = renderToStaticMarkup(h(TableProjection, { file: [ligne()], ouvert: 11434, onOuvrir: () => {}, renderDetail: () => h('span', {}, 'DÉTAIL-ICI') }));
    expect(html).toContain('DÉTAIL-ICI');
    expect(html).toContain('aria-expanded="true"');
  });

  it('BoutonValiderProjection : FAIT AVANCER quand peutValider ; désactivé + explication sinon', () => {
    const actif = renderToStaticMarkup(h(BoutonValiderProjection, { peutValider: true, libelle: '2 bâtiments · 2 emprises tracées · 0 en attente', enCours: false, onValider: () => {} }));
    expect(actif).toContain('Valider la projection');
    expect(actif).not.toContain('disabled');
    const bloque = renderToStaticMarkup(h(BoutonValiderProjection, { peutValider: false, libelle: '2 bâtiments · 1 emprise tracée · 1 en attente', enCours: false, onValider: () => {} }));
    expect(bloque).toContain('disabled');
    expect(bloque).toContain('emprise tracée ou une projection ignorée');
  });
});
