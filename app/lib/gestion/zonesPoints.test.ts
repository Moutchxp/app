import { describe, it, expect } from 'vitest';
import {
  DEBORD_PLUS_PX, POINT_PX, PAS_MINIMAL_DOIGT_PX, PAS_POINTS_PX, ZONE_HAUTEUR_PX, ZONE_LARGEUR_PX, largeurRangee, pointSous, zonesDesPoints,
} from './zonesPoints';

/**
 * 🔴 Arno (26/10/2026) — R1 : le survol et le toucher d'un point ouvrent EXACTEMENT la bulle de CE point. Les zones actives sont
 * centrées sur leur point visuel, hautes de 44 px, et ne recouvrent jamais la zone d'un voisin. Géométrie calculée, PUR.
 */
describe('la cause du décalage, rejouée avec l’ancienne géométrie (11 px, écart 4 px, zones 44 × 44 px)', () => {
  it('le centre de chaque point tombait dans la zone de son voisin de droite, peinte par-dessus : la souris sur un point ouvrait le suivant', () => {
    const anciens = Array.from({ length: 5 }, (_, i) => { const c = 3 + i * 15 + 5.5; return { centre: c, gauche: c - 22, droite: c + 22, haut: -22, bas: 22, pointGauche: c - 5.5, pointDroite: c + 5.5 }; });
    expect(anciens.map((z) => pointSous(anciens, z.centre))).toEqual([1, 2, 3, 4, 4]);   // seul le dernier ouvrait SA bulle
  });
});

describe('la nouvelle géométrie', () => {
  const zones = zonesDesPoints(5);
  it('chaque zone est centrée sur son point visuel (11 px, inchangé), haute de 44 px', () => {
    for (const z of zones) {
      expect((z.gauche + z.droite) / 2).toBe((z.pointGauche + z.pointDroite) / 2);
      expect(z.pointDroite - z.pointGauche).toBe(POINT_PX);
      expect(z.bas - z.haut).toBe(ZONE_HAUTEUR_PX);
    }
  });
  it('aucune zone ne recouvre celle d’un voisin ; largeur ≤ pas ; pas ≥ 24 px (le doigt)', () => {
    for (let i = 1; i < zones.length; i += 1) expect(zones[i].gauche).toBeGreaterThanOrEqual(zones[i - 1].droite);
    expect(ZONE_LARGEUR_PX).toBeLessThanOrEqual(PAS_POINTS_PX);
    expect(PAS_POINTS_PX).toBeGreaterThanOrEqual(PAS_MINIMAL_DOIGT_PX);
  });
  it('survoler n’importe quel endroit d’un point (bords compris) ouvre CE point', () => {
    zones.forEach((z, i) => {
      for (const x of [z.pointGauche, z.centre, z.pointDroite - 0.01]) expect(pointSous(zones, x)).toBe(i);
    });
  });
  it('le « + » voisin (4 px de débord de chaque côté) ne touche ni la zone du premier ni celle du dernier point', () => {
    expect(zones[0].gauche).toBeGreaterThanOrEqual(DEBORD_PLUS_PX);
    expect(zones[zones.length - 1].droite).toBeLessThanOrEqual(largeurRangee(5) - DEBORD_PLUS_PX);
  });
});
