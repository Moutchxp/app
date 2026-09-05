import { describe, it, expect, vi } from 'vitest';

// db/client crée un Pool à l'import (lazy, jamais connecté sans requête) ; on le mocke pour un test PUR de `bornerRayon` (aucune I/O).
vi.mock('../db/client', () => ({ query: vi.fn() }));

import { bornerRayon, RAYON_VOISINES_DEFAUT_M, nomParisArrondissement } from './plancheParcellesRepo';

/** PL-A — décision MESURÉE : rayon des voisines borné (paramètre de code), jamais une section entière (Seq Scan, illisible). */
describe('bornerRayon — le périmètre des voisines, borné', () => {
  it('défaut = 50 m quand rien/invalide n’est fourni', () => {
    expect(bornerRayon(undefined)).toBe(RAYON_VOISINES_DEFAUT_M);
    expect(bornerRayon(null)).toBe(50);
    expect(bornerRayon(Number.NaN)).toBe(50);
  });
  it('valeur normale conservée (arrondie)', () => {
    expect(bornerRayon(80)).toBe(80);
    expect(bornerRayon(49.6)).toBe(50);
  });
  it('borné [10 ; 200] (pas de section entière déguisée en rayon)', () => {
    expect(bornerRayon(5)).toBe(10);
    expect(bornerRayon(9999)).toBe(200);
  });
});

/** PL-B2 §3 — nom d'arrondissement parisien DÉRIVÉ du code cadastral (la table `commune` ne porte que 75056 : on ne joint pas, on dérive). */
describe('nomParisArrondissement — 751xx → « Paris Ne », pur', () => {
  it('arrondissements', () => {
    expect(nomParisArrondissement('75119')).toBe('Paris 19e');
    expect(nomParisArrondissement('75120')).toBe('Paris 20e');
    expect(nomParisArrondissement('75101')).toBe('Paris 1er');
  });
  it('Paris ENTIÈRE (75056) → null (ce n’est pas un arrondissement)', () => {
    expect(nomParisArrondissement('75056')).toBeNull();
  });
  it('hors Paris ou invalide → null (jamais un nom inventé)', () => {
    expect(nomParisArrondissement('94003')).toBeNull();
    expect(nomParisArrondissement('75199')).toBeNull(); // arrondissement 99 n'existe pas
    expect(nomParisArrondissement(null)).toBeNull();
    expect(nomParisArrondissement('7511')).toBeNull();
  });
});
