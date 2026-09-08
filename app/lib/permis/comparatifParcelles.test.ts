import { describe, it, expect } from 'vitest';
import { cleComparaisonParcelle, comparerParcelles, type RefParcelle } from './comparatifParcelles';

/**
 * PL-COMPARATIF — filet PUR de la comparaison « déclaré au permis ↔ sélectionné sur le schéma ». Cas EXIGÉS : correspondance exacte,
 * écritures différentes de la même parcelle (normalisation), parcelle déclarée manquante, parcelle sélectionnée en trop, liste
 * déclarée vide, sélection vide. La normalisation (zéros de tête, casse) est le cœur de l'utilité — un test dédié la verrouille.
 */

const p = (section: string, numero: string): RefParcelle => ({ section, numero });

describe('cleComparaisonParcelle — normalisation', () => {
  it('zéros de tête et casse : « DZ 09 » ⟷ « dz 9 » ⟷ « DZ 0009 » → même clé', () => {
    expect(cleComparaisonParcelle('DZ', '09')).toBe('DZ#9');
    expect(cleComparaisonParcelle('dz', '9')).toBe('DZ#9');
    expect(cleComparaisonParcelle(' DZ ', ' 0009 ')).toBe('DZ#9');
  });
  it('numéro tout à zéro → « 0 » (jamais chaîne vide)', () => {
    expect(cleComparaisonParcelle('AB', '00')).toBe('AB#0');
  });
});

describe('comparerParcelles', () => {
  it('correspondance exacte → concordant, tout commune (vert)', () => {
    const r = comparerParcelles([p('DH', '18'), p('DI', '6')], [p('DH', '18'), p('DI', '6')]);
    expect(r.comparable).toBe(true);
    expect(r.concordant).toBe(true);
    expect(r.lignes.map((l) => l.statut)).toEqual(['commune', 'commune']);
  });

  it('écritures différentes de la MÊME parcelle (« DZ 09 » vs « DZ 9 ») → concordant (normalisation)', () => {
    const r = comparerParcelles([p('DZ', '09'), p('DZ', '10')], [p('DZ', '9'), p('DZ', '10')]);
    expect(r.concordant).toBe(true);
    expect(r.lignes.every((l) => l.statut === 'commune')).toBe(true);
    expect(r.lignes).toHaveLength(2);
  });

  it('parcelle déclarée MANQUANTE (déclarée mais non sélectionnée) → non concordant, rouge côté déclaré', () => {
    const r = comparerParcelles([p('DK', '649')], [p('DK', '654')]);
    expect(r.comparable).toBe(true);
    expect(r.concordant).toBe(false);
    const parCle = Object.fromEntries(r.lignes.map((l) => [l.cle, l.statut]));
    expect(parCle['DK#649']).toBe('declaree_non_selectionnee');
    expect(parCle['DK#654']).toBe('selectionnee_non_declaree');
  });

  it('parcelle sélectionnée EN TROP (sélectionnée mais non déclarée) → non concordant', () => {
    const r = comparerParcelles([p('DH', '18')], [p('DH', '18'), p('DH', '26')]);
    expect(r.concordant).toBe(false);
    const parCle = Object.fromEntries(r.lignes.map((l) => [l.cle, l.statut]));
    expect(parCle['DH#18']).toBe('commune');
    expect(parCle['DH#26']).toBe('selectionnee_non_declaree');
  });

  it('liste déclarée VIDE → non comparable, motif explicite, jamais un faux rouge', () => {
    const r = comparerParcelles([], [p('DH', '18')]);
    expect(r.comparable).toBe(false);
    expect(r.concordant).toBe(false);
    expect(r.motif).toMatch(/déclar/i);
    expect(r.lignes).toEqual([]);
  });

  it('sélection VIDE → non comparable, motif explicite', () => {
    const r = comparerParcelles([p('DH', '18')], []);
    expect(r.comparable).toBe(false);
    expect(r.motif).toMatch(/sélection/i);
  });

  it('référence non normalisable (numéro vide) → « à vérifier », jamais tranchée à tort', () => {
    const r = comparerParcelles([p('DH', '18'), p('DI', '')], [p('DH', '18')]);
    const doute = r.lignes.find((l) => l.statut === 'a_verifier');
    expect(doute).toBeDefined();
    expect(r.concordant).toBe(false); // un doute empêche de déclarer la concordance
  });
});
