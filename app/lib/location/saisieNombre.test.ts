import { describe, expect, it } from 'vitest';
import { filtrerSaisieNombre, gardesAvant, nombreColle } from './saisieNombre';

/** 🔴 Arno (25/10/2026) — les champs numériques stricts de Location : la règle pure (frappe et collage). */
describe('🔴 la frappe : chiffres, UN séparateur (virgule ou point → virgule), espaces de milliers ; décimales bornées', () => {
  it('les caractères refusés sont ignorés, sans message', () => {
    expect(filtrerSaisieNombre('12a3€%-+e', 2)).toBe('123');
    expect(filtrerSaisieNombre('abc', 2)).toBe('');
  });
  it('virgule et point acceptés, affichés en virgule ; un seul séparateur', () => {
    expect(filtrerSaisieNombre('12.5', 2)).toBe('12,5');
    expect(filtrerSaisieNombre('12,5', 2)).toBe('12,5');
    expect(filtrerSaisieNombre('1,2.3', 2)).toBe('1,23');
  });
  it('décimales bornées selon le champ : 2 (euros, %), 3 (indices), 0 (nombre entier)', () => {
    expect(filtrerSaisieNombre('70,125', 2)).toBe('70,12');
    expect(filtrerSaisieNombre('146,6809', 3)).toBe('146,680');
    expect(filtrerSaisieNombre('3,5', 0)).toBe('35');
  });
  it('espaces de milliers tolérés (espace, insécable, fine insécable) ; jamais en tête, jamais doublés, jamais dans les décimales', () => {
    expect(filtrerSaisieNombre('1 234,56', 2)).toBe('1 234,56');
    expect(filtrerSaisieNombre('1 234 567', 2)).toBe('1 234 567');
    expect(filtrerSaisieNombre(' 12  3,4 5', 2)).toBe('12 3,45');
  });
  it('le curseur : le nombre de caractères gardés avant lui', () => {
    expect(gardesAvant('12a3', 3, 2)).toBe(2);
  });
});

describe('🔴 le collage : filtré de même ; sans chiffre, refusé', () => {
  it('« € », « % », lettres retirés ; le dernier séparateur est la décimale', () => {
    expect(nombreColle('1 234,56 €', 2)).toBe('1 234,56');
    expect(nombreColle('1.234,56', 2)).toBe('1234,56');
    expect(nombreColle('1,234.56', 2)).toBe('1234,56');
    expect(nombreColle('12.5 %', 2)).toBe('12,5');
    expect(nombreColle('Loyer : 980 €/mois', 2)).toBe('980');
    expect(nombreColle('146.680', 3)).toBe('146,680');
  });
  it('un champ entier ne prend pas la partie décimale', () => {
    expect(nombreColle('12,5', 0)).toBe('12');
  });
  it('aucun chiffre : null (refusé)', () => {
    expect(nombreColle('abc', 2)).toBeNull();
    expect(nombreColle(' €,. ', 2)).toBeNull();
  });
});
