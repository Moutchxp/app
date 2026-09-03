import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { TableProjection, BoutonValiderProjection, TitreFamilleEtat, type LigneProjectionAffichee } from './ProjectionRendu';
import { etatProjectionTitre, etatAltitudesTitre } from '../../../../lib/permis/etatFamilleProjection';

const ligne = (over: Partial<LigneProjectionAffichee> = {}): LigneProjectionAffichee => ({
  dossierId: 11434, numDau: 'PC07512025V0035', communeNom: 'Paris 15e', natureLibelle: 'Construction neuve', nbBatiments: 2, satisfaitLe: '2026-07-01', nbCorpsSansAltitude: 0, projectionValidee: false, testeEnAnalyse: false, ...over,
});

describe('PROJ-2c — rendu de la file Projection', () => {
  it('TableProjection : liste les permis ; vide → message', () => {
    expect(renderToStaticMarkup(h(TableProjection, { file: [], ouvert: null, onOuvrir: () => {}, renderDetail: () => null }))).toContain('La file est vide');
    const html = renderToStaticMarkup(h(TableProjection, { file: [ligne()], ouvert: null, onOuvrir: () => {}, renderDetail: () => null }));
    expect(html).toContain('PC07512025V0035');
    expect(html).toContain('Construction neuve');
    expect(html).toContain('Paris 15e');
  });

  it('TableProjection : en-tête de 1re colonne = « Permis » par défaut, « Test permis "En cours" » via libellePermis (LOT 54)', () => {
    const parDefaut = renderToStaticMarkup(h(TableProjection, { file: [ligne()], ouvert: null, onOuvrir: () => {}, renderDetail: () => null }));
    expect(parDefaut).toContain('>Permis<');
    expect(parDefaut).not.toContain('Test permis');
    const enTest = renderToStaticMarkup(h(TableProjection, { file: [ligne()], ouvert: null, onOuvrir: () => {}, renderDetail: () => null, libellePermis: 'Test permis « En cours »' }));
    expect(enTest).toContain('Test permis « En cours »');
    // les autres en-têtes ne bougent pas
    expect(enTest).toContain('Commune');
    expect(enTest).toContain('Pièces reçues');
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

  it('BoutonValiderProjection : aucun bâtiment déclaré → message qui renvoie à l’instruction (PROJ-3b)', () => {
    const h0 = renderToStaticMarkup(h(BoutonValiderProjection, { peutValider: false, aucunBatiment: true, libelle: '0 bâtiment · 0 emprise tracée · 0 en attente', enCours: false, onValider: () => {} }));
    expect(h0).toContain('disabled');
    expect(h0).toContain('Déclarez au moins un bâtiment');
    expect(h0).not.toContain('emprise tracée ou une projection ignorée');
  });
});

describe('RATT-1 — état sur la ligne de titre des familles (Analyse et projection)', () => {
  it('TitreFamilleEtat : base + état en continuité, texte porteur (jamais la couleur seule)', () => {
    const html = renderToStaticMarkup(h(TitreFamilleEtat, { base: 'Bâtiments et projection (emprise)', etat: etatProjectionTitre(false) }));
    expect(html).toContain('Bâtiments et projection (emprise)');
    expect(html).toContain('projection non validée'); // le texte porte le sens
    expect(html).toContain('var(--color-svv-red)');   // couleur EXISTANTE, en appui
  });

  it('projection : non validée → rouge ; validée → vert (couleurs existantes)', () => {
    expect(etatProjectionTitre(false)).toEqual({ texte: 'projection non validée', ton: 'rouge' });
    expect(etatProjectionTitre(true)).toEqual({ texte: 'projection validée', ton: 'vert' });
  });

  it('altitudes : 0 bâtiment → NEUTRE (jamais mentir) ; manquante(s) → rouge ; toutes → vert', () => {
    expect(etatAltitudesTitre(0, 0)).toEqual({ texte: 'aucun bâtiment déclaré', ton: 'neutre' });
    expect(etatAltitudesTitre(2, 0)).toEqual({ texte: 'altitudes renseignées (2 bâtiments)', ton: 'vert' });
    expect(etatAltitudesTitre(2, 1)).toEqual({ texte: 'altitude manquante (1/2)', ton: 'rouge' });
    expect(etatAltitudesTitre(3, 2)).toEqual({ texte: 'altitudes manquantes (2/3)', ton: 'rouge' });
  });
});
