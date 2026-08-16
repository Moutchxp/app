import { describe, it, expect } from 'vitest';
import {
  repereDepuisIndex, geomDepuisGeoJSON, construireSchema, optionsPourCorps, polygonesNonAffectes, corpsDuPolygone,
  type CorpsAffectation, type PolygoneAffectable, type PolygoneEntreeSchema,
} from './affectationSchema';

/** FUS-3d — schéma SVG (projection déterministe) + exclusivité/cardinalités de l'affectation, purs et testés. */

describe('repereDepuisIndex', () => {
  it('A, B, … Z puis AA', () => {
    expect([0, 1, 25, 26, 27].map(repereDepuisIndex)).toEqual(['A', 'B', 'Z', 'AA', 'AB']);
  });
});

describe('geomDepuisGeoJSON', () => {
  it('Polygon → anneau extérieur ; MultiPolygon → un anneau par polygone ; autre → vide', () => {
    expect(geomDepuisGeoJSON({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }).anneaux).toHaveLength(1);
    expect(geomDepuisGeoJSON({ type: 'MultiPolygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]], [[[5, 5], [6, 5], [6, 6], [5, 5]]]] }).anneaux).toHaveLength(2);
    expect(geomDepuisGeoJSON({ type: 'LineString', coordinates: [] }).anneaux).toEqual([]);
    expect(geomDepuisGeoJSON(null).anneaux).toEqual([]);
  });
});

const carre = (x0: number, y0: number, c: number): PolygoneEntreeSchema['geom'] => ({ anneaux: [[[x0, y0], [x0 + c, y0], [x0 + c, y0 + c], [x0, y0 + c], [x0, y0]]] });

describe('construireSchema', () => {
  it('empreinte absente → motif explicite, rien dessiné (jamais au hasard)', () => {
    const s = construireSchema(null, []);
    expect(s.empreintePath).toBeNull();
    expect(s.motif).toMatch(/empreinte incomplète ou absente/);
  });

  it('2 polygones dans l’empreinte → 2 chemins projetés, étiquetés, dans la boîte', () => {
    const emp = carre(1000, 2000, 100);
    const s = construireSchema(emp, [
      { repere: 'A', cleabs: 'BAT_A', geom: carre(1010, 2010, 30), horsEmpreinte: false },
      { repere: 'B', cleabs: 'BAT_B', geom: carre(1060, 2060, 30), horsEmpreinte: false },
    ]);
    expect(s.motif).toBeNull();
    expect(s.empreintePath).toContain('M');
    expect(s.polygones.map((p) => p.repere)).toEqual(['A', 'B']);
    for (const p of s.polygones) {
      expect(p.path).toContain('Z');
      expect(p.cx).toBeGreaterThanOrEqual(0); expect(p.cx).toBeLessThanOrEqual(s.largeur);
      expect(p.cy).toBeGreaterThanOrEqual(0); expect(p.cy).toBeLessThanOrEqual(s.hauteur);
    }
  });

  it('polygone hors empreinte → dessiné mais signalé', () => {
    const s = construireSchema(carre(0, 0, 100), [{ repere: 'A', cleabs: 'X', geom: carre(200, 200, 20), horsEmpreinte: true }]);
    expect(s.polygones[0].horsEmpreinte).toBe(true);
  });
});

const corps = (over: Partial<CorpsAffectation>): CorpsAffectation => ({ id: 1, repere: '2D1', altitudeSommetNgf: 88, nbEtages: 7, cleabsAffecte: null, ...over });
const polys: PolygoneAffectable[] = [
  { repere: 'A', cleabs: 'BAT_A', horsEmpreinte: false },
  { repere: 'B', cleabs: 'BAT_B', horsEmpreinte: false },
];

describe('exclusivité / cardinalités', () => {
  it('un polygone affecté à un AUTRE corps disparaît des choix ; le sien reste proposé (réversibilité)', () => {
    const c = [corps({ id: 1, cleabsAffecte: 'BAT_A' }), corps({ id: 2, cleabsAffecte: null })];
    expect(optionsPourCorps(c, polys, 2).map((p) => p.repere)).toEqual(['B']);        // A pris par le corps 1
    expect(optionsPourCorps(c, polys, 1).map((p) => p.repere)).toEqual(['A', 'B']);    // le corps 1 garde A (modifiable)
  });

  it('polygones NON affectés signalés (cardinalités inégales : 2 corps, 1 polygone)', () => {
    const c = [corps({ id: 1, cleabsAffecte: 'BAT_A' }), corps({ id: 2, cleabsAffecte: null })];
    expect(polygonesNonAffectes(c, polys).map((p) => p.repere)).toEqual(['B']);        // B reste libre
    expect(corpsDuPolygone(c, 'BAT_A')?.id).toBe(1);
    expect(corpsDuPolygone(c, 'BAT_B')).toBeNull();
  });
});
