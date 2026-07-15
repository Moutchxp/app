import { describe, it, expect } from 'vitest';
import { destination, R } from './geodesieAffichage';

/**
 * VERROU d'extraction. `destination` a été DÉPLACÉE (verbatim) hors de FaisceauMap.tsx / FaisceauMini.tsx. Le seul
 * risque d'un déplacement est qu'il ne soit pas à l'identique → ces sorties sont FIGÉES EN DUR (calculées depuis la
 * formule extraite). Tout écart = extraction non conforme. Ce test est aussi le filet du lot 5 (générateur serveur).
 */
describe('destination — géodésie d’affichage VERROUILLÉE', () => {
  it('R = rayon Terre 6 371 000 m (constante physique)', () => {
    expect(R).toBe(6371000);
  });

  it.each([
    ['cap 0 (Nord)', 48.8566, 2.3522, 0, 1000, 48.865593216059196, 2.3522],
    ['cap 90 (Est)', 48.8566, 2.3522, 90, 1000, 48.85659919217023, 2.3658686260915744],
    ['cap 180 (Sud)', 48.8566, 2.3522, 180, 1000, 48.84760678394081, 2.3522],
    ['cap 270 (Ouest)', 48.8566, 2.3522, 270, 1000, 48.85659919217023, 2.3385313739084252],
    ['franchit le méridien 0 vers l’Ouest', 48.8566, 0.0005, 270, 1000, 48.85659919217023, -0.013168626091574676],
  ])('%s → sortie figée bit-à-bit', (_l, lat, lon, b, dist, elat, elon) => {
    const [a, o] = destination(lat, lon, b as number, dist as number);
    expect(a).toBe(elat);
    expect(o).toBe(elon);
  });

  it('antiméridien : longitude NON normalisée (> 180) — comportement brut préservé', () => {
    const [lat, lon] = destination(0, 179.99, 90, 100000);
    expect(lon).toBe(180.88932160591875); // pas de wrap : la formule extraite ne normalise pas la longitude
    expect(lat).toBeCloseTo(0, 12);
  });

  it('distance 0 → point identique (cap indifférent)', () => {
    expect(destination(48.9, 2.26, 137, 0)).toEqual([48.9, 2.26]);
  });
});
