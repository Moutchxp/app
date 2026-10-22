import { describe, expect, it } from 'vitest';
import { ecartAzimuts, murDeLaFenetre, normaliserAzimut } from './murFenetre';
import { genererFaisceauxAmplitude } from './geo';

/**
 * 🔴 LOT P (décision d'Arno du 22/10/2026) — le mur de la fenêtre (P2) et l'azimut normalisé (P6). Géométrie simulée en L93.
 */
// Un immeuble rectangulaire de 20 m × 10 m ; façade OUEST de x = 0 (normale extérieure : 270°).
const RECT = 'POLYGON((0 0,20 0,20 10,0 10,0 0))';
// Un immeuble en L : aile basse vers l'Est le long du Sud, aile vers le Nord à l'Ouest. Coin RENTRANT en (10, 10).
const L = 'POLYGON((0 0,30 0,30 10,10 10,10 30,0 30,0 0))';

/** Une direction (azimut) part-elle derrière un mur de normale extérieure `normaleDeg` ? */
const derriere = (azDeg: number, normaleDeg: number) => ecartAzimuts(azDeg, normaleDeg) > 90 + 1e-9;

describe('🔴 façade droite, azimut tenu de travers de 30°', () => {
  it('le mur est celui qui porte le point ; plus aucun faisceau du score ne part derrière lui', () => {
    const mur = murDeLaFenetre(RECT, { x: 0, y: 5 }, 300)!;
    expect(mur.azimutNormaleDeg).toBeCloseTo(270, 9);
    expect(mur.ecartDeg).toBeCloseTo(30, 9);
    expect(mur.sommetsProches).toBe(0);
    // Avant : l'éventail centré sur l'azimut choisi (300°) envoyait 10 faisceaux derrière le mur.
    expect(genererFaisceauxAmplitude(300).filter((a) => derriere(a, 270))).toHaveLength(10);
    // Après : centré sur la normale, aucun.
    expect(genererFaisceauxAmplitude(mur.azimutNormaleDeg).filter((a) => derriere(a, 270))).toHaveLength(0);
  });
});

describe('🔴 coin rentrant (type Asnières) : le mur est choisi selon l’azimut', () => {
  it('au coin rentrant, deux murs candidats : celui dont la normale est la plus proche de l’azimut', () => {
    // Au coin (10, 10) : le mur Nord de l'aile basse (normale 0°) et le mur Est de l'aile Nord (normale 90°).
    expect(murDeLaFenetre(L, { x: 10, y: 10 }, 20)!.azimutNormaleDeg).toBeCloseTo(0, 9);
    expect(murDeLaFenetre(L, { x: 10, y: 10 }, 70)!.azimutNormaleDeg).toBeCloseTo(90, 9);
    // À 0,5 m du coin, sur le mur Nord : le coin est à moins de 1 m, le choix reste ouvert.
    expect(murDeLaFenetre(L, { x: 10.5, y: 10 }, 80)!.azimutNormaleDeg).toBeCloseTo(90, 9);
    // À 2 m du coin : seul le mur qui porte le point compte, quel que soit l'azimut.
    expect(murDeLaFenetre(L, { x: 12, y: 10 }, 80)!.azimutNormaleDeg).toBeCloseTo(0, 9);
  });
  it('la normale est toujours EXTÉRIEURE, quel que soit le sens de tracé du contour', () => {
    const inverse = 'POLYGON((0 0,0 10,20 10,20 0,0 0))';
    expect(murDeLaFenetre(inverse, { x: 0, y: 5 }, 270)!.azimutNormaleDeg).toBeCloseTo(270, 9);
    expect(murDeLaFenetre('MULTIPOLYGON(((0 0,20 0,20 10,0 10,0 0)))', { x: 20, y: 5 }, 90)!.azimutNormaleDeg).toBeCloseTo(90, 9);
  });
});

describe('🔴 P6 — un azimut stocké hors 0–360° est ramené modulo 360', () => {
  it('−27° est traité comme 333°, 378° comme 18°', () => {
    expect(normaliserAzimut(-27)).toBe(333);
    expect(normaliserAzimut(378)).toBe(18);
    expect(normaliserAzimut(90)).toBe(90);
    expect(murDeLaFenetre(L, { x: 10, y: 10 }, -27)).toEqual(murDeLaFenetre(L, { x: 10, y: 10 }, 333));
  });
});
