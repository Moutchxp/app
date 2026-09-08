import { describe, it, expect } from 'vitest';
import { etatProjectionTitre, etatProjectionTitreDepuisComptes, etatAltitudesTitre } from './etatFamilleProjection';
import { clotureVisible } from '../../(admin)/admin/(protected)/permis/CaracteristiquesRendu'; // SOURCE UNIQUE de la visibilité du bloc de sortie (pure)

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

/**
 * BLOC DE SORTIE VISIBLE (repli AVANT ouverture du sous-bloc « Bâtiments et projection ») — le bloc « Valider le permis — envoyer en
 * Rattachement » doit apparaître DÈS l'ouverture de la ligne pour un permis entièrement validé, sans devoir ouvrir le sous-bloc. Sa
 * visibilité = `clotureVisible(mode, etatProjectionTitreDepuisComptes(comptes).ton === 'vert', dejaPasse)` — MÊME source (estValidationAcquise
 * sur les comptes de la ligne) que le titre de section. Cas : tout validé, partiellement validé, 0 bâtiment. Le réglage de clôture
 * (mode `cloture_manuelle`) est HORS PÉRIMÈTRE : ce filet ne fait qu'ancrer le MOMENT (les comptes suffisent, sans en-tête live).
 */
describe('BLOC DE SORTIE — visible dès l’ouverture depuis les comptes de la ligne', () => {
  const sortieVisible = (nbBat: number, sansAlt: number, sansEmp: number, mode: 'automatique' | 'cloture_manuelle' = 'cloture_manuelle', dejaPasse = false) =>
    clotureVisible(mode, etatProjectionTitreDepuisComptes(nbBat, sansAlt, sansEmp).ton === 'vert', dejaPasse);

  it('tout validé (mode clôture manuelle) → bloc de sortie VISIBLE sans en-tête live', () => {
    expect(sortieVisible(1, 0, 0)).toBe(true);
    expect(sortieVisible(3, 0, 0)).toBe(true);
  });
  it('partiellement validé → bloc de sortie MASQUÉ', () => {
    expect(sortieVisible(3, 1, 0)).toBe(false);
    expect(sortieVisible(2, 0, 2)).toBe(false);
  });
  it('0 bâtiment → bloc de sortie MASQUÉ (jamais validé par vacuité)', () => {
    expect(sortieVisible(0, 0, 0)).toBe(false);
  });
  it('règles de clôture INCHANGÉES : mode automatique OU déjà passé → masqué même tout validé', () => {
    expect(sortieVisible(2, 0, 0, 'automatique')).toBe(false);
    expect(sortieVisible(2, 0, 0, 'cloture_manuelle', true)).toBe(false);
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
