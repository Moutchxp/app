import { describe, it, expect } from 'vitest';
import { grouperPolygonesConnexes, polygonesSeTouchent, segmentsSeTouchent, type PolygoneAdoptable } from './adoptionEmprise';

// Carré [x0,y0]→[x0+c,y0+c] (anneau fermé implicite, 4 sommets).
const carre = (cleabs: string, x0: number, y0: number, c = 10): PolygoneAdoptable => ({
  cleabs, anneau: [{ x: x0, y: y0 }, { x: x0 + c, y: y0 }, { x: x0 + c, y: y0 + c }, { x: x0, y: y0 + c }],
});

describe('PROJ-3q — prédicat « se touchent » (partagent au moins un point)', () => {
  it('segmentsSeTouchent : croisement, contact d’extrémité, disjoints', () => {
    expect(segmentsSeTouchent({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(true);  // croisement propre
    expect(segmentsSeTouchent({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 })).toBe(true);   // extrémité commune (colinéaire)
    expect(segmentsSeTouchent({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 5, y: 5 }, { x: 6, y: 6 })).toBe(false);     // disjoints
  });
  it('deux carrés à BORD commun se touchent', () => {
    expect(polygonesSeTouchent(carre('A', 0, 0).anneau, carre('B', 10, 0).anneau)).toBe(true); // partagent l’arête x=10
  });
  it('deux carrés à CONTACT PAR UN SOMMET se touchent', () => {
    expect(polygonesSeTouchent(carre('A', 0, 0).anneau, carre('B', 10, 10).anneau)).toBe(true); // ne partagent que le point (10,10)
  });
  it('deux carrés DISJOINTS ne se touchent pas', () => {
    expect(polygonesSeTouchent(carre('A', 0, 0).anneau, carre('B', 50, 50).anneau)).toBe(false);
  });
});

describe('PROJ-3q — grouperPolygonesConnexes : un groupe = une emprise', () => {
  it('AUCUN polygone → aucun groupe', () => {
    expect(grouperPolygonesConnexes([])).toEqual([]);
  });
  it('UN SEUL polygone → un groupe d’un élément', () => {
    const g = grouperPolygonesConnexes([carre('A', 0, 0)]);
    expect(g).toHaveLength(1);
    expect(g[0].map((p) => p.cleabs)).toEqual(['A']);
  });
  it('PLUSIEURS jointifs (chaîne A–B–C par bords) → UN SEUL groupe', () => {
    const g = grouperPolygonesConnexes([carre('A', 0, 0), carre('B', 10, 0), carre('C', 20, 0)]);
    expect(g).toHaveLength(1);
    expect(g[0].map((p) => p.cleabs).sort()).toEqual(['A', 'B', 'C']);
  });
  it('DEUX groupes disjoints → DEUX emprises indépendantes (jamais fusionnées)', () => {
    const g = grouperPolygonesConnexes([carre('A', 0, 0), carre('B', 10, 0), carre('C', 100, 100), carre('D', 110, 100)]);
    expect(g).toHaveLength(2);
    const parCleabs = g.map((grp) => grp.map((p) => p.cleabs).sort());
    expect(parCleabs).toContainEqual(['A', 'B']);
    expect(parCleabs).toContainEqual(['C', 'D']);
  });
  it('CONTACT PAR UN SOMMET → même groupe', () => {
    const g = grouperPolygonesConnexes([carre('A', 0, 0), carre('B', 10, 10)]);
    expect(g).toHaveLength(1);
    expect(g[0].map((p) => p.cleabs).sort()).toEqual(['A', 'B']);
  });
});
