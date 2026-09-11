import { describe, it, expect } from 'vitest';
import { appliquerAjustement, ajustementIdentite, centroideAnneaux, type PointLambert, type Ajustement } from '../../../../lib/permis/calageEmprise';
import { ancragePoignees, placerPoigneeDansCadre, FACTEUR_TIGE, type CadreBoite } from './ancragePoignees';

// Carré de côté `c`, coin bas-gauche (x,y). Centroïde = (x+c/2, y+c/2).
const carre = (x: number, y: number, c: number): PointLambert[] => [{ x, y }, { x: x + c, y }, { x: x + c, y: y + c }, { x, y: y + c }];
// Applique un DELTA (pivot = centroïde de base, comme en session réelle) et rend la géométrie AFFICHÉE.
const afficher = (anneaux: PointLambert[][], patch: Partial<Ajustement>): PointLambert[][] => {
  const d: Ajustement = { ...ajustementIdentite(anneaux), ...patch };
  return anneaux.map((a) => appliquerAjustement(a, d));
};
const proche = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol;

describe('ancragePoignees (défaut E) — l’ancre suit le CENTRE VISUEL de la géométrie affichée', () => {
  it('translation de 65 m : l’ancre SUIT (centre = centroïde de l’affiché, déplacé d’autant)', () => {
    const base = [carre(0, 0, 10)];            // centroïde (5,5)
    const c0 = centroideAnneaux(base);
    const affiche = afficher(base, { tx: 65.04, ty: -40 }); // amplitude du cas réel (dossier 11430)
    const anc = ancragePoignees(affiche, 0);
    expect(proche(anc.centre.x, c0.x + 65.04)).toBe(true);
    expect(proche(anc.centre.y, c0.y - 40)).toBe(true);
    const cA = centroideAnneaux(affiche);      // et c’est bien le centroïde de l’affiché
    expect(proche(anc.centre.x, cA.x) && proche(anc.centre.y, cA.y)).toBe(true);
  });

  it('l’ancre n’est JAMAIS un sommet ni l’origine du repère (même après un grand déplacement)', () => {
    const affiche = afficher([carre(1000, 2000, 8)], { tx: 65 });
    const anc = ancragePoignees(affiche, 0);
    for (const s of affiche.flat()) expect(proche(anc.centre.x, s.x) && proche(anc.centre.y, s.y)).toBe(false);
    expect(proche(anc.centre.x, 0) && proche(anc.centre.y, 0)).toBe(false);
  });

  it('rotation : l’ancre reste au centroïde ; les poignées tournent AVEC le polygone', () => {
    const affiche = afficher([carre(0, 0, 10)], { rotDeg: 90 }); // rotation autour du centroïde → centroïde inchangé
    const anc = ancragePoignees(affiche, 90);
    expect(proche(anc.centre.x, 5) && proche(anc.centre.y, 5)).toBe(true);
    // poigneeRotation = pt(90 + 90) = pt(180) → à GAUCHE du centre, à la même hauteur
    expect(anc.poigneeRotation.x).toBeLessThan(anc.centre.x);
    expect(proche(anc.poigneeRotation.y, anc.centre.y)).toBe(true);
  });

  it('échelle : l’ancre reste au centroïde ; la tige grandit avec le polygone agrandi', () => {
    const base = [carre(0, 0, 10)];
    const ancBase = ancragePoignees(base, 0);
    const anc = ancragePoignees(afficher(base, { echelle: 2 }), 0); // ×2 autour du centroïde
    expect(proche(anc.centre.x, 5) && proche(anc.centre.y, 5)).toBe(true);
    expect(anc.rayon).toBeGreaterThan(ancBase.rayon * 1.9);
  });

  it('tige PROPORTIONNELLE : rayon = (sommet le plus lointain) × FACTEUR — petit ET grand polygone', () => {
    const petit = ancragePoignees([carre(0, 0, 4)], 0);   // demi-diagonale = √(2²+2²)
    const grand = ancragePoignees([carre(0, 0, 40)], 0);  // demi-diagonale = √(20²+20²)
    expect(proche(petit.rayon, Math.hypot(2, 2) * FACTEUR_TIGE)).toBe(true);
    expect(proche(grand.rayon, Math.hypot(20, 20) * FACTEUR_TIGE)).toBe(true);
    expect(grand.rayon).toBeGreaterThan(petit.rayon);
  });
});

describe('placerPoigneeDansCadre (défaut E) — longueur bornée + repli dans le cadre (unités boîte)', () => {
  const grandCadre: CadreBoite = { minX: 0, minY: 0, w: 100000, h: 100000 };

  it('borne BASSE : une poignée trop proche est éloignée à `min`, même direction (bulles jamais superposées)', () => {
    const p = placerPoigneeDansCadre({ x: 500, y: 500 }, { x: 505, y: 500 }, grandCadre, { min: 40, max: 400 });
    expect(proche(Math.hypot(p.x - 500, p.y - 500), 40)).toBe(true);
    expect(p.x).toBeGreaterThan(500); // direction +x préservée
  });

  it('borne HAUTE : une tige trop longue est plafonnée à `max`', () => {
    const p = placerPoigneeDansCadre({ x: 0, y: 0 }, { x: 9000, y: 0 }, grandCadre, { min: 10, max: 300 });
    expect(proche(Math.hypot(p.x, p.y), 300)).toBe(true);
  });

  it('polygone PRÈS DU BORD : poignée hors du cadre → repliée de l’autre côté du centre (reste visible)', () => {
    const cadre: CadreBoite = { minX: 0, minY: 0, w: 100, h: 100 };
    // centre près du bord droit ; tige de 40 vers la droite → sortirait (x=130) → repli → x = 90 − 40 = 50
    const p = placerPoigneeDansCadre({ x: 90, y: 50 }, { x: 130, y: 50 }, cadre, { min: 5, max: 40 });
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x).toBeLessThanOrEqual(100);
    expect(proche(p.x, 50) && proche(p.y, 50)).toBe(true);
  });

  it('dernier recours : si les DEUX sens sortent, la poignée est ramenée (clamp) dans le cadre', () => {
    const cadre: CadreBoite = { minX: 0, minY: 0, w: 20, h: 20 };
    const p = placerPoigneeDansCadre({ x: 10, y: 10 }, { x: 60, y: 10 }, cadre, { min: 30, max: 30 });
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x).toBeLessThanOrEqual(20);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeLessThanOrEqual(20);
  });
});
