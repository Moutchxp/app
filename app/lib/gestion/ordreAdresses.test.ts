import { describe, expect, it } from 'vitest';
import { comparerAdresses, partiesAdresse, trierAdresses } from './ordreAdresses';

/** 🔴🔴 Arno (26/11/2026, 13h30) — « classées par rue s'il y a plusieurs rues différentes, puis, dans chaque rue, par numéro croissant ». */
const trier = (l: string[]) => trierAdresses(l, (x) => x);

describe('l’ordre des adresses d’une copropriété', () => {
  it('deux rues : par rue (alphabétique, sans majuscules ni accents), puis numéro croissant dans chaque rue', () => {
    expect(trier(['40 Rue Baudin', '3 rue de l’Église', '30 rue Baudin', '1 RUE ÉMILE ZOLA', '2 rue de l’eglise']))
      .toEqual(['30 rue Baudin', '40 Rue Baudin', '2 rue de l’eglise', '3 rue de l’Église', '1 RUE ÉMILE ZOLA']);
  });
  it('numéro en NOMBRE : 2 avant 10', () => {
    expect(trier(['10 rue Baudin', '2 rue Baudin', '100 rue Baudin', '9 rue Baudin'])).toEqual(['2 rue Baudin', '9 rue Baudin', '10 rue Baudin', '100 rue Baudin']);
  });
  it('l’indice suit son numéro : 18, 18 bis, 18 ter, 20 (« 18B » = 18 bis)', () => {
    expect(trier(['20 rue Baudin', '18 ter rue Baudin', '18 rue Baudin', '18B rue Baudin'])).toEqual(['18 rue Baudin', '18B rue Baudin', '18 ter rue Baudin', '20 rue Baudin']);
    expect(partiesAdresse('18 bis rue Baudin, 92400 Courbevoie')).toEqual({ numero: 18, indice: 1, voie: 'rue baudin' });
  });
  it('« 12-28 » est classé à 12 ; sans numéro : en fin de sa rue', () => {
    expect(trier(['rue Baudin', '14 rue Baudin', '12-28 rue Baudin', '10 rue Baudin'])).toEqual(['10 rue Baudin', '12-28 rue Baudin', '14 rue Baudin', 'rue Baudin']);
    expect(partiesAdresse('12-28 rue Baudin').numero).toBe(12);
  });
  it('le code postal et la commune après la virgule n’entrent pas dans la rue ; un nom de voie qui commence par une lettre (« 5 boulevard ») n’est pas un indice', () => {
    expect(comparerAdresses('5 rue Baudin, 92400 Courbevoie', '5 RUE BAUDIN')).toBe(0);
    expect(partiesAdresse('5 boulevard Haussmann')).toEqual({ numero: 5, indice: 0, voie: 'boulevard haussmann' });
    expect(partiesAdresse('7 quai de Dion')).toEqual({ numero: 7, indice: 0, voie: 'quai de dion' });
  });
});
