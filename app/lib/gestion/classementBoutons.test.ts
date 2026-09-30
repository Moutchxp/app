import { describe, it, expect } from 'vitest';
import { BIENS_NOMMES_MAX, ligneCompacteDuBien, resumeBiensRattaches } from './classementBoutons';

/**
 * ══ 🔴 LOT CLASSER-DEUX-BOUTONS — CE QUE LA CASE VERTE ET LA LIGNE DE RÉSULTAT ÉCRIVENT ═══════════════════════
 *
 * Deux décisions d'affichage, éprouvées sans monter le moindre composant : combien de biens on nomme avant de
 * compter le reste, et comment se lit une ligne de recherche.
 */
describe('🔴 la liste courte des biens rattachés', () => {
  it('un bien : son libellé, tel quel', () => {
    expect(resumeBiensRattaches(['28 av. Marceau — lot 421'])).toBe('28 av. Marceau — lot 421');
  });

  it('deux biens : les deux, séparés par une virgule', () => {
    expect(resumeBiensRattaches(['A', 'B'])).toBe('A, B');
  });

  /**
   * 🔴 « +2 » COMPTE CE QU'ON NE MONTRE PAS, pas le total. « A, B, +2 » se lit « et deux autres » — la seule
   * lecture utile. Écrire le total obligerait à soustraire de tête.
   */
  it('🔴 au-delà, « +N » compte le RESTE, jamais le total', () => {
    expect(resumeBiensRattaches(['A', 'B', 'C', 'D'])).toBe('A, B, +2');
    expect(resumeBiensRattaches(['A', 'B', 'C'])).toBe('A, B, +1');
  });

  it('aucun bien : un mot, jamais une chaîne vide', () => {
    expect(resumeBiensRattaches([])).toBe('aucun bien');
  });

  /** ⚠️ UN LIBELLÉ BLANC LAISSERAIT UNE VIRGULE ORPHELINE, qui se lit comme un bug. */
  it('⚠️ les libellés vides sont écartés, pas affichés', () => {
    expect(resumeBiensRattaches(['A', '   ', 'B'])).toBe('A, B');
    expect(resumeBiensRattaches(['  '])).toBe('aucun bien');
  });

  it('le seuil est nommé, et au moins un bien est toujours montré', () => {
    expect(BIENS_NOMMES_MAX).toBe(2);
    expect(resumeBiensRattaches(['A', 'B', 'C'], 0)).toBe('A, +2');
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
