import { describe, it, expect, vi } from 'vitest';

// db/client crée un Pool à l'import (lazy, jamais connecté sans requête) ; on le mocke pour un test PUR de `bornerRayon` (aucune I/O).
vi.mock('../db/client', () => ({ query: vi.fn() }));

import { bornerRayon, RAYON_VOISINES_DEFAUT_M } from './plancheParcellesRepo';

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
