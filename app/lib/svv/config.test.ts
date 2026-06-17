import { describe, it, expect } from 'vitest';
import {
  ANALYSIS_RANGE_M,
  BEAM_RANGE_M,
  SCORE_DISTANCE_MAX_M,
  CLEAR_BEAM_DIST_M,
  FLOOR_HEIGHT_M,
  EYE_HEIGHT_M,
  THRESHOLD_M,
  hauteurVision,
  altitudeFenetre,
} from './config';

describe('config SVV — portée d’analyse partagée', () => {
  it('verrouille BEAM_RANGE_M === SCORE_DISTANCE_MAX_M === 200', () => {
    expect(BEAM_RANGE_M).toBe(200);
    expect(SCORE_DISTANCE_MAX_M).toBe(200);
    expect(BEAM_RANGE_M).toBe(SCORE_DISTANCE_MAX_M);
  });

  it('toutes les portées dérivent de la même constante ANALYSIS_RANGE_M', () => {
    expect(ANALYSIS_RANGE_M).toBe(200);
    expect(BEAM_RANGE_M).toBe(ANALYSIS_RANGE_M);
    expect(SCORE_DISTANCE_MAX_M).toBe(ANALYSIS_RANGE_M);
    expect(CLEAR_BEAM_DIST_M).toBe(ANALYSIS_RANGE_M);
  });
});

describe('config SVV — constantes définitives (CLAUDE.md §2 & §4)', () => {
  it('hauteur d’étage et œil humain', () => {
    expect(FLOOR_HEIGHT_M).toBe(2.9);
    expect(EYE_HEIGHT_M).toBe(1.65);
  });

  it('seuil du label = 40 m', () => {
    expect(THRESHOLD_M).toBe(40);
  });
});

describe('config SVV — hauteur de vision (aucun arrondi)', () => {
  it('rez-de-chaussée → 1.65 m', () => {
    expect(hauteurVision(0)).toBe(1.65);
  });

  it('3e étage → 10.35 m', () => {
    expect(hauteurVision(3)).toBe(3 * 2.9 + 1.65);
    expect(hauteurVision(3)).toBeCloseTo(10.35, 10);
  });

  it('altitude fenêtre = terrain + hauteur de vision (vecteur SPEC §9)', () => {
    // 4e étage, terrain 41 m → 41 + (4 × 2.90 + 1.65) = 54.25 m
    expect(altitudeFenetre(41, 4)).toBe(41 + (4 * 2.9 + 1.65));
    expect(altitudeFenetre(41, 4)).toBeCloseTo(54.25, 10);
  });
});
