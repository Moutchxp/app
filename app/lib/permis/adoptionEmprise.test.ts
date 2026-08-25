import { describe, it, expect } from 'vitest';
import { grouperPolygonesConnexes, grouperParBatiment, polygonesSeTouchent, segmentsSeTouchent, type PolygoneAdoptable } from './adoptionEmprise';

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

describe('PROJ-3r — grouperParBatiment : affectation cleabs→bâtiment + connexité PAR bâtiment', () => {
  const coches = [carre('A', 0, 0), carre('B', 10, 0), carre('C', 100, 100), carre('D', 110, 100)];
  const aff = (m: Record<string, number>) => Object.entries(m).map(([cleabs, corpsId]) => ({ cleabs, corpsId }));

  it('AUTOMATIQUE : tous au même bâtiment → connexité interne (A+B jointifs = 1, C+D jointifs = 1)', () => {
    const g = grouperParBatiment(coches, aff({ A: 1, B: 1, C: 1, D: 1 }));
    expect(g).toHaveLength(1);
    expect(g[0].corpsId).toBe(1);
    expect(g[0].composantes.map((c) => c.map((p) => p.cleabs).sort())).toContainEqual(['A', 'B']);
    expect(g[0].composantes.map((c) => c.map((p) => p.cleabs).sort())).toContainEqual(['C', 'D']);
  });
  it('DEUX GROUPES → DEUX BÂTIMENTS : chaque bâtiment reçoit sa composante', () => {
    const g = grouperParBatiment(coches, aff({ A: 1, B: 1, C: 2, D: 2 }));
    expect(g.map((x) => x.corpsId)).toEqual([1, 2]);
    expect(g[0].composantes).toHaveLength(1); // A+B
    expect(g[1].composantes).toHaveLength(1); // C+D
  });
  it('SCINDER : deux polygones jointifs affectés à des bâtiments DIFFÉRENTS → jamais unis', () => {
    const g = grouperParBatiment(coches, aff({ A: 1, B: 2, C: 1, D: 1 }));
    const b1 = g.find((x) => x.corpsId === 1)!, b2 = g.find((x) => x.corpsId === 2)!;
    expect(b1.composantes.some((c) => c.map((p) => p.cleabs).sort().join() === 'A')).toBe(true); // A seul chez 1
    expect(b2.composantes.map((c) => c.map((p) => p.cleabs))).toEqual([['B']]);                   // B seul chez 2
  });
  it('FUSIONNER : deux groupes DISJOINTS au MÊME bâtiment → 2 emprises DISTINCTES (jamais unies)', () => {
    // A+B (groupe 1) et C+D (groupe 2) disjoints, tous au bâtiment 1 → 2 composantes distinctes
    const g = grouperParBatiment(coches, aff({ A: 1, B: 1, C: 1, D: 1 }));
    expect(g[0].composantes).toHaveLength(2);
  });
  it('un cleabs NON affecté n’est pas adopté', () => {
    const g = grouperParBatiment(coches, aff({ A: 1, B: 1 })); // C, D non affectés
    expect(g).toHaveLength(1);
    expect(g[0].composantes.flat().map((p) => p.cleabs).sort()).toEqual(['A', 'B']);
  });
});
