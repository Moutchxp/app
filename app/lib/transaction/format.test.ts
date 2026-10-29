import { describe, expect, it } from 'vitest';
import { ESPACE, eur, grouperSaisie, nombreFr, pctFr } from './format';
import { montant } from './saisie';

/**
 * 🔴 LOT AM (Arno, 29/10/2026) — LE FORMAT UNIQUE DES NOMBRES DE LA TUILE « TRANSACTION » : les milliers séparés par une espace insécable de
 * largeur normale (U+00A0, visible), jamais l'espace fine d'Intl (U+202F, invisible dans la police) ; l'unité collée par la même espace.
 */
describe('🔴 LOT AM — espaces des milliers', () => {
  it('les gros montants : une espace visible tous les 3 chiffres, et aucune espace fine', () => {
    for (const [x, attendu] of [[87960, '87 960,00 €'], [7500, '7 500,00 €'], [4000, '4 000,00 €'], [1625, '1 625,00 €'], [2962962.94, '2 962 962,94 €'], [12.5, '12,50 €'], [-1234.5, '-1 234,50 €']] as const) {
      expect(eur(x)).toBe(attendu.replace(/ /g, ESPACE));
      expect(eur(x)).not.toMatch(/[   ]/);
    }
    expect(ESPACE).toBe(' ');
  });
  it('comptes et pourcentages au-delà de 999 aussi', () => {
    expect(nombreFr(1234)).toBe(`1${ESPACE}234`);
    expect(pctFr(1250.5)).toBe(`1${ESPACE}250,5${ESPACE}%`);
    expect(pctFr(33.33333)).toBe(`33,3333${ESPACE}%`);
  });
  it('une saisie regroupée à la sortie du champ : les chiffres tapés ne changent pas, la valeur lue non plus', () => {
    for (const [tape, affiche] of [['7500', '7 500'], ['7 500', '7 500'], ['1625,5', '1 625,5'], ['2962962.94', '2 962 962,94'], ['12', '12'], ['', ''], ['abc', 'abc']] as const) {
      const g = grouperSaisie(tape);
      expect(g).toBe(affiche.replace(/ /g, ESPACE));
      // la valeur enregistrée (lue côté serveur) : identique avant et après le regroupement
      expect(montant(g)).toBe(montant(tape));
    }
    // le collage de « 7 500 » (espace ordinaire, fine ou insécable) ou « 7500 » donne la même valeur
    expect([montant('7 500'), montant('7 500'), montant(`7${ESPACE}500`), montant('7500')]).toEqual([7500, 7500, 7500, 7500]);
  });
});
