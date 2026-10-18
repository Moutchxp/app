import { describe, expect, it } from 'vitest';
import {
  bouchon, bullesParImage, DUREE_FETE_S, FeteChampagne, flutes, fondu, geometrie, goulot, PALETTE,
} from './feteChampagne';

/** La fête du « Oui », maquette « A+ » d'Arno (18/10/2026) — la chronologie et les repères, sans navigateur. */
describe('la fête du « Oui » : repères et chronologie de la maquette', () => {
  const g = geometrie(576, 112);

  it('les repères : zone gauche w/2 − 115, zone droite w/2 + 140, flûtes à 0,70 h, goulot à h − 34 ; bornés DANS un bouton étroit', () => {
    expect(g).toMatchObject({ zoneG: 288 - 115, zoneD: 288 + 140, piedFlutes: 0.7 * 112, sommetGoulot: 112 - 34 });
    expect(g.hautFlute).toBeLessThanOrEqual(90);
    expect(g.piedFlutes - g.hautFlute).toBeGreaterThanOrEqual(0); // le haut des verres reste dans le bouton
    const tel = geometrie(304, 112);
    expect(tel.zoneD).toBeLessThanOrEqual(304 - 34);
    expect(tel.zoneG).toBeGreaterThanOrEqual(26);
    expect(geometrie(800, 200).hautFlute).toBe(90);
  });

  it('les couleurs de la maquette', () => {
    expect(PALETTE).toMatchObject({ or: '#d9a441', orClair: '#f6d77f', orMoyen: '#e8c46a', blanc: '#ffffff', rose: '#f2b8b0', goulot: '#1d4a2a' });
  });

  it('la bouteille monte (0 → 0,30 s), soubresaut au POP, redescend (0,95 → 1,35 s) et sort par le bas', () => {
    expect(goulot(0, g).y).toBeGreaterThan(g.h);
    expect(goulot(0.3, g).y).toBeCloseTo(g.sommetGoulot, 5);
    expect(goulot(0.6, g).y).toBeCloseTo(g.sommetGoulot, 5);
    expect(goulot(0.4, g).dx).not.toBe(0);
    expect(goulot(1.35, g).y).toBeGreaterThan(g.h + 100);
    expect(goulot(1.4, g).visible).toBe(false);
  });

  it('le bouchon est posé sur le goulot, puis file vers le HAUT au POP (0,38 s) et sort du bouton en ~0,4 s en tournant', () => {
    expect(bouchon(0.37, g)).toMatchObject({ yBas: goulot(0.37, g).y, angle: 0, visible: true });
    const apres = bouchon(0.38 + 0.4, g);
    expect(apres.yBas).toBeLessThan(0);
    expect(apres.angle).toBeGreaterThan(3);
  });

  it('les flûtes montent (1,0 → 1,4 s), se penchent (→ 1,65 s), trinquent avec un petit rebond', () => {
    expect(flutes(0.9, g).visible).toBe(false);
    expect(flutes(1.0, g).dy).toBeGreaterThan(g.h);
    expect(flutes(1.4, g).dy).toBeCloseTo(0, 5);
    expect(flutes(1.4, g).inclinaison).toBeCloseTo(0, 5);
    expect(flutes(1.65, g).inclinaison).toBeCloseTo(0.2, 5);
    expect(flutes(1.8, g).inclinaison).toBeLessThan(0.2);
  });

  it('bulles : 3 par image jusqu’à 1,8 s, de plus en plus rares jusqu’à 2,9 s, puis aucune ; fondu de 2,6 s à 4 s', () => {
    expect([bullesParImage(0), bullesParImage(1.8), bullesParImage(2.35), bullesParImage(2.9), bullesParImage(3.5)]).toEqual([3, 3, 1.5, 0, 0]);
    expect([fondu(2.5), fondu(2.6), fondu(4)]).toEqual([1, 1, 0]);
    expect(fondu(3.3)).toBeCloseTo(0.5, 10);
  });

  it('une fête entière à 60 images/s : gouttes au POP, 36 étincelles au trinquage, fin à 4 s ; rien ne s’arrête d’un coup', () => {
    const f = new FeteChampagne(576, 112);
    let maxEtincelles = 0; let gouttes = 0;
    for (let i = 0; i <= 4 * 60; i += 1) {
      const t = i / 60;
      f.avancer(t);
      const c = f.compter();
      if (t > 0.4 && t < 0.85) gouttes = Math.max(gouttes, c.gouttes);
      if (t >= 1.65 && t < 1.7) maxEtincelles = Math.max(maxEtincelles, c.etincelles);
    }
    expect(gouttes).toBeGreaterThan(0);
    expect(maxEtincelles).toBe(36);
    expect(f.finie).toBe(true);
    expect(f.t).toBe(DUREE_FETE_S);
  });
});
