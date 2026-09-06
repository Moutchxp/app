import { describe, it, expect } from 'vitest';
import { clicVersBoiteMeet, clicVersBoite, rotePoint, boiteEnglobanteRotee } from '../../../../lib/permis/calageEmprise';

/**
 * FILET du CALAGE CÔTÉ SCHÉMA — la moitié qui n'avait PAS de filet (le symptôme d'Arno : le point rouge persistant tombait à CÔTÉ du
 * curseur). Le SVG du schéma est en `preserveAspectRatio="xMidYMid meet"` : dès que le rapport d'aspect du conteneur ≠ de celui du
 * viewBox (hauteur plafonnée par maxHeight, ou VUE AGRANDIE), le viewBox est LETTERBOXÉ (mis à l'échelle « meet », centré). Le clic
 * doit être converti EN TENANT COMPTE du letterbox + de la rotation. On PROUVE que le point posé tombe exactement sous le curseur.
 */

// FORWARD (référence) : un point de BOÎTE Q, dessiné dans <g rotate(+angle)> puis rendu via « meet » (scale = min, centrage xMid/yMid),
//   tombe à la position ÉCRAN ci-dessous. clicVersBoiteMeet doit être son INVERSE exact.
function ecranPour(Q: { x: number; y: number }, vb: { minX: number; minY: number; w: number; h: number }, centre: { x: number; y: number }, angle: number, ew: number, eh: number) {
  const R = rotePoint(Q, centre, angle);                 // position AFFICHÉE (le <g> tourne de +angle)
  const scale = Math.min(ew / vb.w, eh / vb.h);
  const offX = (ew - vb.w * scale) / 2, offY = (eh - vb.h * scale) / 2; // marges du letterbox
  return { x: offX + (R.x - vb.minX) * scale, y: offY + (R.y - vb.minY) * scale };
}

const centre = { x: 150, y: 115 };
const pointsBox = [{ x: 20, y: 20 }, { x: 280, y: 30 }, { x: 260, y: 200 }, { x: 40, y: 190 }];
const Q = { x: 130, y: 90 }; // point cliqué (coord de boîte)

describe('FILET calage SCHÉMA — le point persistant tombe SOUS le curseur (meet + rotation + vue agrandie)', () => {
  const cas: [number, number, number, string][] = [
    [0, 900, 300, 'letterbox HORIZONTAL (conteneur large, hauteur plafonnée)'],
    [0, 300, 900, 'letterbox VERTICAL'],
    [37, 900, 320, 'letterbox + ROTATION 37°'],
    [213.5, 1600, 520, 'letterbox + rotation + VUE AGRANDIE'],
  ];
  for (const [angle, ew, eh, label] of cas) {
    it(`(a) ${label} : clic → box = Q (au pixel)`, () => {
      const vb = boiteEnglobanteRotee(pointsBox, centre, angle);
      const e = ecranPour(Q, vb, centre, angle, ew, eh);
      const box = clicVersBoiteMeet(e.x, e.y, ew, eh, vb, centre, angle);
      expect(box.x).toBeCloseTo(Q.x, 6); // construction EXACTE ; tolérance 1e-6 pour l'IEEE754 seulement
      expect(box.y).toBeCloseTo(Q.y, 6);
    });
  }

  it('🔴 SANS letterbox (aspect conteneur = aspect viewBox) → strictement identique à clicVersBoite (rétro-compat)', () => {
    const angle = 0, vb = boiteEnglobanteRotee(pointsBox, centre, angle);
    const ew = vb.w * 2, eh = vb.h * 2; // même rapport d'aspect → scale unique, marges nulles
    const m = clicVersBoiteMeet(50, 40, ew, eh, vb, centre, angle);
    const c = clicVersBoite(50, 40, ew, eh, vb, centre, angle);
    expect(m.x).toBeCloseTo(c.x, 9);
    expect(m.y).toBeCloseTo(c.y, 9);
  });

  it('AVANT le correctif, le mapping SANS letterbox se serait trompé : clicVersBoite sur la bounding box entière ≠ Q en cas de letterbox', () => {
    // Démonstration du bug d'origine : mapper le clic sur (ew, eh) ENTIERS (ancien onClick) donne un point FAUX quand il y a letterbox.
    const angle = 0, vb = boiteEnglobanteRotee(pointsBox, centre, angle), ew = 900, eh = 300;
    const e = ecranPour(Q, vb, centre, angle, ew, eh);
    const faux = clicVersBoite(e.x, e.y, ew, eh, vb, centre, angle); // ANCIEN comportement (sans correction meet)
    expect(Math.hypot(faux.x - Q.x, faux.y - Q.y)).toBeGreaterThan(5); // décalé de plus de 5 unités de boîte → visible
  });
});
