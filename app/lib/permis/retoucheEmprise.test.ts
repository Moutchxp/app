import { describe, it, expect } from 'vitest';
import { deplacerSommet, insererSommet, supprimerSommet, sommetProche, bordProche } from './retoucheEmprise';

const carre = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];

describe('PROJ-3s — retoucheEmprise (pur) : déplacer / insérer / supprimer, garde ≥ 3 sommets', () => {
  it('DÉPLACER un sommet → seul ce sommet change', () => {
    const r = deplacerSommet(carre, 1, { x: 12, y: -1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.anneau[1]).toEqual({ x: 12, y: -1 });
    expect(r.anneau[0]).toEqual({ x: 0, y: 0 });   // les autres intacts
    expect(r.anneau).toHaveLength(4);
  });
  it('INSÉRER un sommet sur le bord i → longueur +1, inséré APRÈS i', () => {
    const r = insererSommet(carre, 0, { x: 5, y: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.anneau).toHaveLength(5);
    expect(r.anneau[1]).toEqual({ x: 5, y: 0 });   // entre le sommet 0 et l'ancien sommet 1
  });
  it('SUPPRIMER un sommet (au-dessus de 3) → longueur −1', () => {
    const r = supprimerSommet(carre, 2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.anneau).toHaveLength(3);
    expect(r.anneau.map((p) => p.x)).toEqual([0, 10, 0]);
  });
  it('SUPPRIMER sous 3 sommets → REFUS avec message clair, anneau inchangé (jamais un plantage)', () => {
    const triangle = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 8 }];
    const r = supprimerSommet(triangle, 1);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motif).toMatch(/au moins 3 sommets/);
  });
  it('index hors bornes → refus, pas d’exception', () => {
    expect(deplacerSommet(carre, 9, { x: 0, y: 0 }).ok).toBe(false);
    expect(insererSommet(carre, -1, { x: 0, y: 0 }).ok).toBe(false);
    expect(supprimerSommet(carre, 9).ok).toBe(false);
  });
  it('sommetProche : dans le rayon → index ; hors rayon → -1', () => {
    expect(sommetProche(carre, { x: 10.5, y: 0.4 }, 2)).toBe(1);
    expect(sommetProche(carre, { x: 5, y: 5 }, 2)).toBe(-1);
  });
  it('bordProche : le bord dont le clic est le plus proche (dernier bord reboucle)', () => {
    expect(bordProche(carre, { x: 5, y: 0.2 })).toBe(0);   // bord 0→1 (bas)
    expect(bordProche(carre, { x: 0.2, y: 5 })).toBe(3);   // bord 3→0 (gauche, rebouclage)
  });
});
