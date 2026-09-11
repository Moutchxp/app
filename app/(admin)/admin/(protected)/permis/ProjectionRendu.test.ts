import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { TableProjection, TitreFamilleEtat, type LigneProjectionAffichee } from './ProjectionRendu';
import { etatProjectionTitre, etatAltitudesTitre, etatCoherenceBatimentsTitre, etatMereCaracteristiques } from '../../../../lib/permis/etatFamilleProjection';

const ligne = (over: Partial<LigneProjectionAffichee> = {}): LigneProjectionAffichee => ({
  dossierId: 11434, numDau: 'PC07512025V0035', communeNom: 'Paris 15e', natureLibelle: 'Construction neuve', nbBatiments: 2, satisfaitLe: '2026-07-01', nbCorpsSansAltitude: 0, nbBatimentsValide: 2, nbCorpsSansAltValidee: 2, nbCorpsSansEmpriseValidee: 2, projectionValidee: false, testeEnAnalyse: false, plancheEtat: null, ...over,
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

  it('TableProjection : colonnes déterministes et PARTAGÉES entre les deux tableaux (table-layout fixe + colgroup identique) — LOT 55', () => {
    const colgroup = (s: string) => s.slice(s.indexOf('<colgroup'), s.indexOf('</colgroup>') + '</colgroup>'.length);
    const parDefaut = renderToStaticMarkup(h(TableProjection, { file: [ligne()], ouvert: null, onOuvrir: () => {}, renderDetail: () => null }));
    expect(parDefaut).toContain('table-layout:fixed');                     // largeurs lues du colgroup, pas du contenu
    const cg = colgroup(parDefaut);
    expect((cg.match(/<col /g) ?? []).length).toBe(5);                     // 5 colonnes dimensionnées (l'espace exclut <colgroup)
    // MÊME colgroup quel que soit l'en-tête → colonnes strictement alignées entre file en test et file ordinaire
    const enTest = renderToStaticMarkup(h(TableProjection, { file: [ligne()], ouvert: null, onOuvrir: () => {}, renderDetail: () => null, libellePermis: 'Test permis « En cours »' }));
    expect(colgroup(enTest)).toBe(cg);
  });

  it('TableProjection : ligne ouverte rend le détail (renderDetail) et masque les colonnes', () => {
    const html = renderToStaticMarkup(h(TableProjection, { file: [ligne()], ouvert: 11434, onOuvrir: () => {}, renderDetail: () => h('span', {}, 'DÉTAIL-ICI') }));
    expect(html).toContain('DÉTAIL-ICI');
    expect(html).toContain('aria-expanded="true"');
  });

  // COMPLÉMENT (07/09/2026) — le composant global `BoutonValiderProjection` a été SUPPRIMÉ (vestige d'un 2e chemin de validation).
  //   Ses tests sont retirés ; le garde « il ne réapparaît pas » vit dans lot51cSortieRattachement.test.ts (source de ProjectionVue/Rendu).
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

  it('altitudes : 0 carte → ROUGE (BAT-2, plus de neutre par vacuité) ; manquante(s) → rouge ; toutes → vert', () => {
    expect(etatAltitudesTitre(0, 0)).toEqual({ texte: 'aucune carte de bâtiment', ton: 'rouge' });
    expect(etatAltitudesTitre(2, 0)).toEqual({ texte: 'altitudes renseignées (2 bâtiments)', ton: 'vert' });
    expect(etatAltitudesTitre(2, 1)).toEqual({ texte: 'altitude manquante (1/2)', ton: 'rouge' });
    expect(etatAltitudesTitre(3, 2)).toEqual({ texte: 'altitudes manquantes (2/3)', ton: 'rouge' });
  });
});

/**
 * BAT-2 — la LIGNE MÈRE « Caractéristiques du permis (saisie) » reflète l'état AGRÉGÉ de ses sous-sections porteuses (section 1 cohérence +
 * section 4 altitudes), rendue par le MÊME TitreFamilleEtat. Tests en node pur (renderToStaticMarkup) : on asserte le COMPORTEMENT (le sens
 * porté par le texte + le ton via le token de couleur EXISTANT), jamais la forme du HTML. Le vert est asserté par ABSENCE des textes bloquants
 * + token vert (le libellé vert exact n'est pas figé).
 */
describe('BAT-2 — mère « Caractéristiques du permis (saisie) » (rendu)', () => {
  const rendreMere = (etats: Parameters<typeof etatMereCaracteristiques>[0]) =>
    renderToStaticMarkup(h(TitreFamilleEtat, { base: 'Caractéristiques du permis (saisie)', etat: etatMereCaracteristiques(etats) }));

  it('toutes porteuses vertes → mère VERTE (token vert, aucun texte de blocage)', () => {
    const html = rendreMere([etatCoherenceBatimentsTitre(2, 2), etatAltitudesTitre(2, 0)]);
    expect(html).toContain('Caractéristiques du permis (saisie)');
    expect(html).toContain('var(--color-svv-green-ink)');
    expect(html).not.toContain('manquante');
    expect(html).not.toContain('non validé');
  });

  it('une porteuse ROUGE (altitude manquante) → mère ROUGE et NOMME le blocage (texte de la porteuse)', () => {
    const html = rendreMere([etatCoherenceBatimentsTitre(3, 3), etatAltitudesTitre(3, 1)]);
    expect(html).toContain('var(--color-svv-red)');
    expect(html).toContain('altitude manquante (1/3)'); // reprend le texte de la porteuse, jamais une 2e formulation
  });

  it('une porteuse NEUTRE (nombre non validé) → mère ROUGE et la nomme (« pas encore fait » bloque)', () => {
    const html = rendreMere([etatCoherenceBatimentsTitre(3, null), etatAltitudesTitre(3, 0)]);
    expect(html).toContain('var(--color-svv-red)');
    expect(html).toContain('nombre de bâtiments non validé');
  });

  it('section 4 : 0 carte → ROUGE « aucune carte de bâtiment » (sur son propre titre)', () => {
    const html = renderToStaticMarkup(h(TitreFamilleEtat, { base: 'Les futurs bâtiments et leurs altitudes', etat: etatAltitudesTitre(0, 0) }));
    expect(html).toContain('aucune carte de bâtiment');
    expect(html).toContain('var(--color-svv-red)');
  });

  it('section 1 : cartes ≠ nombre validé → ROUGE disant l’incohérence (sur son propre titre)', () => {
    const html = renderToStaticMarkup(h(TitreFamilleEtat, { base: 'Caractéristiques et bâtiments d’origine', etat: etatCoherenceBatimentsTitre(3, 2) }));
    expect(html).toContain('3 cartes pour 2 bâtiments validés');
    expect(html).toContain('var(--color-svv-red)');
  });
});

describe('COMPLÉMENT — TableProjection : le n° passe au VERT ⟺ le bouton de clôture est disponible (source unique clotureVisible)', () => {
  const rendre = (over: Partial<LigneProjectionAffichee>, modePassage: 'automatique' | 'cloture_manuelle') =>
    renderToStaticMarkup(h(TableProjection, { file: [ligne(over)], ouvert: null, onOuvrir: () => {}, renderDetail: () => null, modePassage }));

  it('🔴 validable (clôture manuelle + tous bâtiments alt+emprise validés + non passé) → n° VERT (même token que « Projection validée ») + ✓ (signal non coloré)', () => {
    const html = rendre({ nbCorpsSansAltValidee: 0, nbCorpsSansEmpriseValidee: 0 }, 'cloture_manuelle');
    expect(html).toContain('var(--color-svv-green-ink)');
    expect(html).toContain('✓');
    expect(html).not.toContain('color:var(--color-svv-red)'); // le n° n'est plus rouge
  });
  it('🔴 un bâtiment sans emprise validée → PAS validable → n° ROUGE, aucun ✓ (le bouton ne s’affiche pas non plus)', () => {
    const html = rendre({ nbCorpsSansAltValidee: 0, nbCorpsSansEmpriseValidee: 1 }, 'cloture_manuelle');
    expect(html).toContain('var(--color-svv-red)');
    expect(html).not.toContain('✓');
  });
  it('🔴 même tout validé, en mode AUTOMATIQUE le bouton n’est pas disponible → n° ROUGE (jamais vert sans bouton)', () => {
    const html = rendre({ nbCorpsSansAltValidee: 0, nbCorpsSansEmpriseValidee: 0 }, 'automatique');
    expect(html).toContain('var(--color-svv-red)');
    expect(html).not.toContain('✓');
  });
});
