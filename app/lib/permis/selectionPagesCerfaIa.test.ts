import { describe, it, expect } from 'vitest';
import { estPageIdentite, cibleDePage, selectionnerPagesIa, journalTransmission, MAX_PAGES_IA } from './selectionPagesCerfaIa';

/** CR-2b1 — sélection RGPD PAR CONTENU. Abstention par défaut : une page ne part que si POSITIVEMENT cible ET NÉGATIVEMENT sans identité. */

describe('estPageIdentite — marqueurs explicites', () => {
  it('détecte les marqueurs d’identité (courriel, naissance, téléphone, nom, SIRET, ordre, signature)', () => {
    expect(estPageIdentite('Courriel : daniel.schneider@rivp.fr').identite).toBe(true);
    expect(estPageIdentite('Né le 12/03/1980 à Paris').identite).toBe(true);
    expect(estPageIdentite('Téléphone : 0 1 4 3 5 4 6 7 8 8').identite).toBe(true);
    expect(estPageIdentite('Nom : Borel  Prénom : Frédéric').identite).toBe(true);
    expect(estPageIdentite('SIRET 4 0 3 6 0 0 1 6 6 0 0 0 2 5').identite).toBe(true);
    expect(estPageIdentite('inscrit à l’ordre des architectes').identite).toBe(true);
    expect(estPageIdentite('Signature du demandeur').identite).toBe(true);
  });
  it('ne confond pas « Nombre » avec « Nom »', () => {
    expect(estPageIdentite('Nombre total de logements créés : 5').identite).toBe(false);
  });
  it('une page de contenu projet sans identité passe', () => {
    expect(estPageIdentite('5.2 Nature du projet envisagé : Nouvelle construction. Surface créée 818 m².').identite).toBe(false);
  });
});

describe('cibleDePage — nature / description', () => {
  it('reconnaît les cibles utiles', () => {
    expect(cibleDePage('5.2 Nature du projet envisagé Nouvelle construction')).toEqual({ nature: true, description: false });
    expect(cibleDePage('Courte description de votre projet ou de vos travaux :')).toEqual({ nature: false, description: true });
    expect(cibleDePage('Superficie du terrain (m²)')).toEqual({ nature: false, description: false });
  });
});

describe('selectionnerPagesIa — le comportement RGPD', () => {
  it('page propre avec cible → ENVOYÉE ; page mêlée (cible + identité) → REFUSÉE avec motif', () => {
    const sel = selectionnerPagesIa([
      { page: 18, texte: 'Courte description de votre projet ou de vos travaux : Construction d’un bâtiment à R+4.' }, // propre
      { page: 17, texte: 'Nature du projet : Nouvelle construction. Courriel architecte@exemple.fr' },              // mêlée
    ]);
    expect(sel.envoyees.map((e) => e.page)).toEqual([18]);
    const r17 = sel.refusees.find((r) => r.page === 17);
    expect(r17?.motif).toMatch(/identité présente/);
    expect(r17?.motif).toMatch(/courriel/);
  });

  it('page sans cible → refusée « aucune cible utile »', () => {
    const sel = selectionnerPagesIa([{ page: 5, texte: 'Superficie du terrain (m²) : 5015' }]);
    expect(sel.envoyees).toEqual([]);
    expect(sel.refusees[0].motif).toMatch(/aucune cible utile/);
  });

  it('plafond de 6 pages : au-delà, on garde les mieux notées et on journalise les évincées', () => {
    const pages = Array.from({ length: 8 }, (_, i) => ({ page: i + 1, texte: 'Courte description de votre projet' }));
    const sel = selectionnerPagesIa(pages);
    expect(sel.envoyees.length).toBe(MAX_PAGES_IA);
    expect(sel.refusees.filter((r) => /plafond/.test(r.motif)).length).toBe(8 - MAX_PAGES_IA);
  });

  it('une page « nature + description » est mieux notée qu’une page à une seule cible (priorité sous plafond)', () => {
    const pages = [
      ...Array.from({ length: 6 }, (_, i) => ({ page: i + 1, texte: 'Courte description de votre projet' })), // score 1
      { page: 7, texte: 'Nature du projet Nouvelle construction. Courte description de votre projet' },        // score 2
    ];
    const sel = selectionnerPagesIa(pages);
    expect(sel.envoyees.map((e) => e.page)).toContain(7); // la page à 2 cibles passe malgré le plafond
  });

  it('aucune cible nulle part (format non reconnu) → abstention totale', () => {
    const sel = selectionnerPagesIa([{ page: 1, texte: 'Un document quelconque' }, { page: 2, texte: 'sans cible' }]);
    expect(sel.envoyees).toEqual([]);
  });
});

describe('journalTransmission — forme persistable (preuve de ce qui sort de la machine)', () => {
  it('porte la pièce, les pages envoyées et les pages refusées avec motif', () => {
    const sel = selectionnerPagesIa([
      { page: 18, texte: 'Courte description de votre projet ou de vos travaux :' },
      { page: 17, texte: 'Nature du projet. Courriel a@b.fr' },
    ]);
    const j = journalTransmission(521, 'cerfa_13409-13.pdf', sel);
    expect(j.pieceId).toBe(521);
    expect(j.pieceNom).toBe('cerfa_13409-13.pdf');
    expect(j.envoyees.map((e) => e.page)).toEqual([18]);
    expect(j.refusees.find((r) => r.page === 17)?.motif).toMatch(/identité présente/);
    expect(() => JSON.stringify(j)).not.toThrow(); // sérialisable jsonb
  });
});
