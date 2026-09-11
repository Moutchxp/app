import { describe, it, expect } from 'vitest';
import { validationParCorpsDepuisEmprises } from './etatValidationEmprise';

// Fabrique une emprise minimale (seuls corpsId + validee comptent pour la règle).
const e = (corpsId: number | null, validee: boolean) => ({ corpsId, validee });

describe('validationParCorpsDepuisEmprises (point 1) — validation par corps = SEULE vérité par emprise', () => {
  it('corps à une emprise validée → validé', () => {
    expect(validationParCorpsDepuisEmprises([e(1, true)])).toEqual({ 1: true });
  });

  it('corps à une emprise NON validée → non validé (cas réel 11434 : validee_le NULL)', () => {
    expect(validationParCorpsDepuisEmprises([e(1, false), e(2, false)])).toEqual({ 1: false, 2: false });
  });

  it('corps à deux emprises, une seule validée → NON validé (il faut TOUTES les emprises)', () => {
    expect(validationParCorpsDepuisEmprises([e(1, true), e(1, false)])).toEqual({ 1: false });
  });

  it('corps à deux emprises toutes validées → validé', () => {
    expect(validationParCorpsDepuisEmprises([e(1, true), e(1, true)])).toEqual({ 1: true });
  });

  it('plusieurs corps indépendants : chacun son verdict', () => {
    expect(validationParCorpsDepuisEmprises([e(1, true), e(2, false), e(3, true)])).toEqual({ 1: true, 2: false, 3: true });
  });

  it('emprises orphelines (corpsId null) ignorées ; aucune emprise → objet vide', () => {
    expect(validationParCorpsDepuisEmprises([e(null, true), e(null, false)])).toEqual({});
    expect(validationParCorpsDepuisEmprises([])).toEqual({});
  });
});
