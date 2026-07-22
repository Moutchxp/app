import { describe, it, expect } from 'vitest';
import { deriverExterieur } from './descriptif';

describe('deriverExterieur — liste TOUS les extérieurs cochés', () => {
  it('balcon seul → « Balcon »', () => expect(deriverExterieur({ balcon: true })).toBe('Balcon'));
  it('terrasse seule → « Terrasse »', () => expect(deriverExterieur({ terrasse: true })).toBe('Terrasse'));
  it('jardin seul → « Jardin »', () => expect(deriverExterieur({ jardin: true })).toBe('Jardin'));
  it('balcon + terrasse → « Balcon, Terrasse » (ordre balcon → terrasse → jardin)', () =>
    expect(deriverExterieur({ balcon: true, terrasse: true })).toBe('Balcon, Terrasse'));
  it('les trois → « Balcon, Terrasse, Jardin »', () =>
    expect(deriverExterieur({ balcon: true, terrasse: true, jardin: true })).toBe('Balcon, Terrasse, Jardin'));
  it('terrasse + jardin (balcon absent) → « Terrasse, Jardin »', () =>
    expect(deriverExterieur({ terrasse: true, jardin: true })).toBe('Terrasse, Jardin'));
  it('aucun coché → « Aucun »', () => expect(deriverExterieur({ balcon: false, terrasse: false, jardin: false })).toBe('Aucun'));
  it('payload vide → « Aucun »', () => expect(deriverExterieur({})).toBe('Aucun'));
  it('payload null → null (non-couplage)', () => expect(deriverExterieur(null)).toBeNull());
  it('valeurs non strictement true ignorées (« true » chaîne, 1) → « Aucun »', () =>
    expect(deriverExterieur({ balcon: 'true', terrasse: 1 })).toBe('Aucun'));
});
