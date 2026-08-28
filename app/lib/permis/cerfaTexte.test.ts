import { describe, it, expect } from 'vitest';
import { nbLogementsTexte, surfacePlancherTexte } from './cerfaTexte';

describe('LECT-1 (C) — nbLogementsTexte : MODE corroboré', () => {
  it('« 21 logements » répété → 21 (majoritaire), malgré l’artefact « 2 1 logements » minoritaire', () => {
    const t = 'Construction de 21 logements. Résidence sociale de 21 logements. Un relais de 2 1 logements. Comportant 21 logements.';
    expect(nbLogementsTexte(t)).toEqual({ valeur: 21, occurrences: 3 });
  });
  it('une SEULE occurrence → null (non corroboré, on n’écrit pas dans le doute)', () => {
    expect(nbLogementsTexte('un immeuble de 8 logements')).toBeNull();
  });
  it('EX ÆQUO (12 et 15 chacun 2×) → null (ambigu)', () => {
    expect(nbLogementsTexte('12 logements ici, 15 logements là, encore 12 logements, et 15 logements')).toBeNull();
  });
  it('aucun « logements » → null', () => {
    expect(nbLogementsTexte('surface de plancher créée de 586 m²')).toBeNull();
  });
});

describe('LECT-1 (C) — surfacePlancherTexte : exige l’étiquette, exclut les seuils', () => {
  it('« surface de plancher créée : 1240 m² » → 1240', () => {
    expect(surfacePlancherTexte('La surface de plancher créée est de 1240 m² au total.')).toMatchObject({ valeur: 1240 });
  });
  it('PIÈGE 531 — « surface créée : 586.0 m² » (sous-sol, PAS surface de plancher) → null', () => {
    expect(surfacePlancherTexte('niveau de sous-sol (surface créée : 586.0 m²) ; Vu les pièces')).toBeNull();
  });
  it('PHRASE DE SEUIL — « surface de plancher n’excède pas 150 m² » → null (pas une valeur de projet)', () => {
    expect(surfacePlancherTexte('agricole dont la surface de plancher n’excède pas 150 m²')).toBeNull();
    expect(surfacePlancherTexte('une surface de référence supérieure à 2500 m² de surface de plancher')).toBeNull();
  });
  it('sans étiquette « surface de plancher » → null', () => {
    expect(surfacePlancherTexte('emprise au sol de 300 m²')).toBeNull();
  });
});
