import { describe, it, expect } from 'vitest';
import { genererJetonVerification, REGEXP_JETON_VERIFICATION } from './certificatJeton';

describe('genererJetonVerification — accord avec le CHECK 038 par construction', () => {
  // On NE teste PAS la qualité de l'aléa (non testable sérieusement en unitaire ; crypto.randomBytes fait foi).
  // On teste le CONTRAT DE FORMAT : chaque jeton satisfait la regex partagée (miroir exact du CHECK SQL 038).
  it('chaque tirage satisfait REGEXP_JETON_VERIFICATION (16 car. Crockford), sur 5000 tirages', () => {
    for (let i = 0; i < 5000; i++) {
      const j = genererJetonVerification();
      expect(j).toMatch(REGEXP_JETON_VERIFICATION);
    }
  });

  it('aucun caractère ambigu (I, L, O, U) ne sort jamais, sur 5000 tirages', () => {
    for (let i = 0; i < 5000; i++) {
      expect(genererJetonVerification()).not.toMatch(/[ILOU]/);
    }
  });

  it('longueur toujours 16 (80 bits / 5, sans padding)', () => {
    expect(genererJetonVerification()).toHaveLength(16);
  });

  it('deux tirages successifs diffèrent (attrape une constante / un aléa gelé)', () => {
    expect(genererJetonVerification()).not.toBe(genererJetonVerification());
  });
});
