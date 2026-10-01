import { describe, it, expect } from 'vitest';
import { ligneCompacteDuBien, lignePremierBien } from './classementBoutons';

/**
 * ══ 🔴 CE QUE LES ÉCRANS DE CLASSEMENT ÉCRIVENT ═══════════════════════════════════════════════════════════════
 *
 * Deux décisions d'affichage, éprouvées sans monter le moindre composant : ce que la ligne « Bien(s)
 * rattaché(s) : » montre d'abord, et comment se lit une ligne de recherche.
 *
 * ⚠️ CE FICHIER ÉPROUVAIT AUSSI `resumeBiensRattaches` — la liste courte d'adresses SOUS le mot de la case verte
 * (« A, B, +2 »). Elle a été RETIRÉE au lot CLASSER-SUR-CHAQUE-MAIL : Arno a coupé la question en deux, et
 * chaque moitié a désormais sa place et ses épreuves — la case verte COMPTE (`resumeParCategorie`, dans
 * `categorieBien.test.ts`), la ligne de gauche NOMME (ci-dessous). Rien n'est perdu, tout a déménagé.
 */

/**
 * ══ 🔴🔴 LOT CLASSER-SUR-CHAQUE-MAIL — LA LIGNE « BIEN(S) RATTACHÉ(S) : » ═════════════════════════════════════
 *
 * ARNO : « Affiche l'adresse complète du PREMIER bien (adresse — type — lot N). S'il y a plusieurs biens, ou si
 * l'adresse est tronquée : un petit lien “voir plus” au bout. »
 */
describe('🔴🔴 ce que la ligne montre d’abord', () => {
  const COURT = '4 rue Hugo — lot 12';
  const LONG = '38-44 rue de la Vanne, 92120 MONTROUGE — Appartement meublé Type 3 — lot 418';

  it('🔴 un seul bien court : son libellé entier, et AUCUN « voir plus »', () => {
    expect(lignePremierBien([COURT])).toEqual({ premier: COURT, voirPlus: false, total: 1 });
  });

  it('🔴 plusieurs biens : le PREMIER, et « voir plus »', () => {
    const l = lignePremierBien([COURT, '2 rue Mars — lot 99']);
    expect(l.premier).toBe(COURT);
    expect(l.voirPlus).toBe(true);
    expect(l.total).toBe(2);
  });

  /**
   * ══ 🔴🔴 LOT AUCUNE-PROPOSITION-ET-ANIMATION-INVERSE — LA TRONCATURE EST MESURÉE, PLUS DEVINÉE ═════════════
   *
   * ARNO : « le lien ne s'affiche que si la vue dépliée montre AU MOINS une information absente de la ligne de
   * base. Un seul bien, entièrement visible → pas de lien. Pour le décider, compare au contenu réellement
   * affiché. » Un libellé long qui TIENT n'est donc plus une raison d'ouvrir : seule la coupure réelle en est une.
   */
  it('🔴🔴 un seul bien, même long : PAS de lien tant qu’il tient à l’écran', () => {
    expect(LONG.length).toBeGreaterThan(54);
    expect(lignePremierBien([LONG]).voirPlus).toBe(false);
  });

  it('🔴🔴 …et le lien revient dès que l’écran dit qu’il est coupé', () => {
    expect(lignePremierBien([LONG], { tronque: true }).voirPlus).toBe(true);
    expect(lignePremierBien([COURT], { tronque: true }).voirPlus).toBe(true);
  });

  /** 🔴 L'AUTRE RAISON D'OUVRIR : une mention que la ligne ne porte pas (« cette pièce seulement »). */
  it('🔴🔴 une mention absente de la ligne suffit à proposer « voir plus »', () => {
    expect(lignePremierBien([COURT], { enPlus: ['cette pièce seulement'] }).voirPlus).toBe(true);
    // ⚠️ Une mention VIDE n'est pas une information : elle ne doit rien ouvrir.
    expect(lignePremierBien([COURT], { enPlus: ['   '] }).voirPlus).toBe(false);
    expect(lignePremierBien([COURT], { enPlus: [] }).voirPlus).toBe(false);
  });

  it('aucun bien : rien à montrer, rien à déplier', () => {
    expect(lignePremierBien([])).toEqual({ premier: '', voirPlus: false, total: 0 });
  });

  /** ⚠️ UN LIBELLÉ BLANC NE PREND PAS LA PREMIÈRE PLACE : il pousserait les vrais hors de vue. */
  it('⚠️ les libellés vides sont écartés, jamais affichés en tête', () => {
    expect(lignePremierBien(['   ', COURT]).premier).toBe(COURT);
    expect(lignePremierBien(['   ', COURT]).total).toBe(1);
    expect(lignePremierBien(['  ']).total).toBe(0);
  });
});

describe('🔴 la ligne compacte d’un résultat de recherche', () => {
  const bien = (o: Partial<Parameters<typeof ligneCompacteDuBien>[0]> = {}) => ligneCompacteDuBien({
    libelle: '28 av. Marceau — lot 421', typeBien: 'Appartement',
    parties: [{ role: 'proprietaire', nom: 'MARTY' }, { role: 'locataire', nom: 'DUPONT' }],
    ...o,
  });

  it('le type suit le libellé, après un point médian', () => {
    expect(bien().titre).toBe('28 av. Marceau — lot 421 · Appartement');
  });

  it('sans type connu, le libellé seul — jamais un point médian orphelin', () => {
    expect(bien({ typeBien: null }).titre).toBe('28 av. Marceau — lot 421');
    expect(bien({ typeBien: '  ' }).titre).toBe('28 av. Marceau — lot 421');
  });

  /**
   * 🔴 « VACANT » EST UN MOT, JAMAIS UN BLANC. Un champ vide se lit « on ne sait pas » ; « Vacant » se lit
   * « il n'y a personne », ce qui est un FAIT — et souvent celui qui fait trancher.
   */
  it('🔴 sans locataire, « Vacant » — et pas un blanc', () => {
    expect(bien({ parties: [{ role: 'proprietaire', nom: 'MARTY' }] }).locataire).toBe('Vacant');
  });

  /** ⚠️ UN BIEN EN INDIVISION APPARTIENT À PLUSIEURS : n'en montrer qu'un ferait chercher pourquoi. */
  it('⚠️ tous les co-propriétaires sont nommés', () => {
    expect(bien({ parties: [
      { role: 'proprietaire', nom: 'MARTY' }, { role: 'proprietaire', nom: 'HUGO' },
    ] }).proprietaires).toBe('MARTY, HUGO');
  });

  it('plusieurs locataires sont tous nommés eux aussi', () => {
    expect(bien({ parties: [
      { role: 'locataire', nom: 'DUPONT' }, { role: 'locataire', nom: 'DURAND' },
    ] }).locataire).toBe('DUPONT, DURAND');
  });

  it('propriétaire inconnu : on le DIT, on ne laisse pas un vide', () => {
    expect(bien({ parties: [] }).proprietaires).toBe('(propriétaire inconnu)');
  });
});
