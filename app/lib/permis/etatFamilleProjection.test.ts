import { describe, it, expect } from 'vitest';
import { etatProjectionTitre, etatProjectionTitreDepuisComptes, etatAltitudesTitre } from './etatFamilleProjection';

/**
 * RATT-1 — états portés par la ligne de titre des familles « Bâtiments et projection » / « Caractéristiques du permis ». PUR.
 * Règle NON négociable (Arno) : 0 bâtiment déclaré → NEUTRE (ni « renseignées », ni « manquantes » : rien à renseigner).
 */
describe('RATT-1 — etatProjectionTitre', () => {
  it('non validée → rouge ; validée → vert', () => {
    expect(etatProjectionTitre(false)).toEqual({ texte: 'projection non validée', ton: 'rouge' });
    expect(etatProjectionTitre(true)).toEqual({ texte: 'projection validée', ton: 'vert' });
  });
});

/**
 * CORRECTIF A — repli du titre « Bâtiments et projection » calculé sur les COMPTES de la ligne (validation PAR BÂTIMENT, calqué sur
 * estValidationAcquise, MÊME règle que l'en-tête live). La section et la ligne disent une seule vérité, indépendante du jalon dossier
 * `permis_projection`. Cas couverts : tout validé, rien validé, partiellement validé, 0 bâtiment.
 */
describe('CORRECTIF A — etatProjectionTitreDepuisComptes (comptes → état)', () => {
  it('tout validé (≥1 bâtiment, 0 sans altitude, 0 sans emprise) → VERT', () => {
    expect(etatProjectionTitreDepuisComptes(1, 0, 0)).toEqual({ texte: 'Projection validée', ton: 'vert' });
    expect(etatProjectionTitreDepuisComptes(3, 0, 0)).toEqual({ texte: 'Projections validées', ton: 'vert' }); // pluriel
  });
  it('rien validé (toutes altitudes ET emprises manquantes) → ROUGE disant ce qui manque', () => {
    expect(etatProjectionTitreDepuisComptes(2, 2, 2)).toEqual({ texte: 'projection non validée — à valider : 2 altitudes de sommet et 2 emprises', ton: 'rouge' });
  });
  it('partiellement validé (une seule dimension manque) → ROUGE ciblé', () => {
    expect(etatProjectionTitreDepuisComptes(3, 1, 0)).toEqual({ texte: 'projection non validée — à valider : 1 altitude de sommet', ton: 'rouge' });
    expect(etatProjectionTitreDepuisComptes(3, 0, 2)).toEqual({ texte: 'projection non validée — à valider : 2 emprises', ton: 'rouge' });
  });
  it('0 bâtiment → ROUGE (jamais validé par vacuité)', () => {
    expect(etatProjectionTitreDepuisComptes(0, 0, 0)).toEqual({ texte: 'projection non validée (aucun bâtiment déclaré)', ton: 'rouge' });
  });
});

describe('RATT-1 — etatAltitudesTitre', () => {
  it('0 bâtiment déclaré → NEUTRE (jamais mentir)', () => {
    expect(etatAltitudesTitre(0, 0)).toEqual({ texte: 'aucun bâtiment déclaré', ton: 'neutre' });
    expect(etatAltitudesTitre(0, 5)).toEqual({ texte: 'aucun bâtiment déclaré', ton: 'neutre' }); // garde-fou : nb sans altitude ignoré si 0 déclaré
  });
  it('≥ 1 bâtiment sans altitude → rouge (avec compte) ; pluriel accordé', () => {
    expect(etatAltitudesTitre(2, 1)).toEqual({ texte: 'altitude manquante (1/2)', ton: 'rouge' });
    expect(etatAltitudesTitre(3, 2)).toEqual({ texte: 'altitudes manquantes (2/3)', ton: 'rouge' });
  });
  it('toutes renseignées → vert (avec compte) ; pluriel accordé', () => {
    expect(etatAltitudesTitre(1, 0)).toEqual({ texte: 'altitudes renseignées (1 bâtiment)', ton: 'vert' });
    expect(etatAltitudesTitre(4, 0)).toEqual({ texte: 'altitudes renseignées (4 bâtiments)', ton: 'vert' });
  });
});
