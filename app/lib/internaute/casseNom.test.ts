import { describe, it, expect } from 'vitest';
import { normaliserCasseNom } from './casseNom';

describe('normaliserCasseNom — casse par segment (première lettre majuscule, reste intact sauf tout-majuscule)', () => {
  it.each([
    ['arnaud', 'Arnaud'],
    ['jean-pierre', 'Jean-Pierre'],
    ['JOREL', 'Jorel'], // ENTIÈREMENT majuscule → reste minusculisé
    ["d'artagnan", "D'Artagnan"],
    ['McDonald', 'McDonald'], // pas tout-majuscule → reste INTACT
    ["O'Brien", "O'Brien"], // segments « O » (tout-maj, 1 lettre) et « Brien » (intact)
    ['mcdonald', 'Mcdonald'], // limite ACCEPTÉE : on ne devine pas le « D » interne
  ])('%s → %s', (entree, attendu) => {
    expect(normaliserCasseNom(entree)).toBe(attendu);
  });

  it('cas composés supplémentaires', () => {
    expect(normaliserCasseNom('van der berg')).toBe('Van Der Berg'); // chaque mot
    expect(normaliserCasseNom('é' + 'lise')).toBe('Élise'); // accent en tête
    expect(normaliserCasseNom("jean-PIERRE")).toBe('Jean-Pierre'); // segment tout-maj → minusculisé
    expect(normaliserCasseNom('')).toBe(''); // vide → vide
  });
});
