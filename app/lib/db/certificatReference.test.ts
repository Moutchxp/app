import { describe, it, expect } from 'vitest';
import { genererReference, REGEXP_REFERENCE } from './certificatReference';

describe('genererReference — accord avec le CHECK 039 par construction', () => {
  // On NE teste PAS la qualité de l'aléa (crypto.randomBytes fait foi). On teste le CONTRAT DE FORMAT.
  it('chaque tirage satisfait REGEXP_REFERENCE (SVAV-XXXX-XXXX Crockford), sur 5000 tirages', () => {
    for (let i = 0; i < 5000; i++) {
      expect(genererReference()).toMatch(REGEXP_REFERENCE);
    }
  });

  it('préfixe SVAV (et JAMAIS SAVV du numéro interne)', () => {
    const r = genererReference();
    expect(r.startsWith('SVAV-')).toBe(true);
    expect(r.startsWith('SAVV-')).toBe(false);
  });

  it('forme exacte : SVAV + deux groupes de 4 (longueur 14, deux tirets)', () => {
    const r = genererReference();
    expect(r).toHaveLength(14); // « SVAV » (4) + « - » + 4 + « - » + 4
    expect(r.split('-')).toHaveLength(3);
    expect(r.split('-').map((g) => g.length)).toEqual([4, 4, 4]);
  });

  it('aucun caractère ambigu (I, L, O, U) ne sort jamais, sur 5000 tirages', () => {
    for (let i = 0; i < 5000; i++) {
      expect(genererReference().slice(5)).not.toMatch(/[ILOU]/); // slice(5) : après « SVAV- »
    }
  });

  it('deux tirages successifs diffèrent (attrape une constante / un aléa gelé)', () => {
    expect(genererReference()).not.toBe(genererReference());
  });
});
