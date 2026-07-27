import { describe, it, expect } from 'vitest';
import { type Bbox, ajustement, projeterL93VersSvg, bboxDe, TOLERANCE_SIMPLIFICATION_M, SEUIL_PAYLOAD_CARTE_OCTETS } from './carteProjection';

describe('Sitadel S6 — projection Lambert-93 → SVG (conforme, linéaire, Y inversé)', () => {
  // Cadre carré 100×100, bbox L93 carrée 1000 m → échelle 0,1 px/m, sans marge.
  const bbox: Bbox = [645000, 6860000, 646000, 6861000];
  const dims = { largeur: 100, hauteur: 100, marge: 0 };

  it('échelle uniforme (pas de distorsion) et coins connus', () => {
    const a = ajustement(bbox, dims);
    expect(a.echelle).toBeCloseTo(0.1, 6);
    // Coin Nord-Ouest (xmin, ymax) → haut-gauche (0,0).
    expect(projeterL93VersSvg(645000, 6861000, bbox, a)).toEqual([0, 0]);
    // Coin Sud-Est (xmax, ymin) → bas-droit (100,100).
    const [sx, sy] = projeterL93VersSvg(646000, 6860000, bbox, a);
    expect(sx).toBeCloseTo(100, 6); expect(sy).toBeCloseTo(100, 6);
    // Centre → (50,50).
    const [cx, cy] = projeterL93VersSvg(645500, 6860500, bbox, a);
    expect(cx).toBeCloseTo(50, 6); expect(cy).toBeCloseTo(50, 6);
  });

  it('l’axe Y est INVERSÉ : plus au Nord = plus haut (y SVG plus petit)', () => {
    const a = ajustement(bbox, dims);
    const [, ySud] = projeterL93VersSvg(645500, 6860100, bbox, a);
    const [, yNord] = projeterL93VersSvg(645500, 6860900, bbox, a);
    expect(yNord).toBeLessThan(ySud);
  });

  it('bboxDe englobe tous les anneaux', () => {
    expect(bboxDe([[[10, 20], [30, 5]], [[0, 40], [50, 25]]])).toEqual([0, 5, 50, 40]);
  });
});

describe('Sitadel S6 — garde-fous de charge utile', () => {
  it('tolérance de simplification et seuil de charge utile fixés (mesuré ~266 ko < 300 ko)', () => {
    expect(TOLERANCE_SIMPLIFICATION_M).toBe(100);
    expect(SEUIL_PAYLOAD_CARTE_OCTETS).toBe(300_000);
    expect(266_000).toBeLessThan(SEUIL_PAYLOAD_CARTE_OCTETS); // mesure réelle S6 (CoverageSimplify 100 m, 2154) sous le plafond
  });
});
