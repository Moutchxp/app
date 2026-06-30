import { describe, it, expect } from 'vitest';
import { resoudreSommet } from './obstacles';
import { FLOOR_HEIGHT_OBSTACLE_M, FLOOR_HEIGHT_M } from '../svv/config';

// Découplage observateur / estimation obstacle : le tier 3 (estimation par étages d'un immeuble
// VOISIN sans altitude de toit ni hauteur BD TOPO) doit utiliser FLOOR_HEIGHT_OBSTACLE_M (2,90),
// indépendamment de FLOOR_HEIGHT_M (2,80, hauteur d'étage de l'OBSERVATEUR).
describe('resoudreSommet — tier 3 (estimation par étages, immeuble voisin)', () => {
  // nature/impact_pt_wkt : champs d'enrichissement Couche 1 B, ignorés par resoudreSommet.
  const base = { id: 1, cleabs: 'TEST', dist_m: 30, nature: null, corridor_wkt: '', axe_wkt: '', impact_pt_wkt: '' };

  it('amt=null, h=null, sol+net renseignés → sol + net × 2,90 (FLOOR_HEIGHT_OBSTACLE_M, PAS 2,80)', () => {
    const r = resoudreSommet({ ...base, amt: null, h: null, sol: 40, net: 5 });
    expect(r.source).toBe('BD_TOPO');
    expect(r.altitudeSommetM).toBe(40 + 5 * 2.9);     // = 54.5
    expect(r.altitudeSommetM).not.toBe(40 + 5 * 2.8); // découplage : surtout PAS la hauteur observateur
  });

  it('constantes découplées : obstacle = 2,90, observateur = 2,80', () => {
    expect(FLOOR_HEIGHT_OBSTACLE_M).toBe(2.9);
    expect(FLOOR_HEIGHT_M).toBe(2.8);
    expect(FLOOR_HEIGHT_OBSTACLE_M).not.toBe(FLOOR_HEIGHT_M);
  });

  it('tier 1 (amt) prioritaire — non affecté par le découplage', () => {
    const r = resoudreSommet({ ...base, amt: 60, h: null, sol: 40, net: 5 });
    expect(r.altitudeSommetM).toBe(60);
    expect(r.source).toBe('BD_TOPO');
  });
});
