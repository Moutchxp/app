import { describe, expect, it } from 'vitest';
import { calculerExclusion, exclusionPourBanc } from './exclusionPivot';

/** Banc d'essai (Arno, 22/10/2026) — les faisceaux de l'éventail visé que le pivot exclut, comptés faisceau par faisceau. */
describe('faisceaux exclus par le pivot', () => {
  it('Ulbach : façade 242,1°, azimut 229° → 5 exclus (−90° à −78°), 15° retirés, 5 ajoutés de l’autre côté', () => {
    const e = calculerExclusion(229, 242.13299614843544);
    expect(e.ecartDeg).toBeCloseTo(13.132996148435495, 9);
    expect(e.vises.filter((f) => f.exclu).map((f) => f.offsetDeg)).toEqual([-90, -87, -84, -81, -78]);
    expect(e.n).toBe(5);
    expect(e.total).toBe(61);
    expect(e.pourcentage).toBe((5 / 61) * 100);
    expect(e.secteurRetireDeg).toBe(15);
    expect(e.amplitudeDeg).toBe(180);
    expect(e.ajoutesOffsetsDeg).toEqual([78, 81, 84, 87, 90]);
    expect(e.vises[0]).toEqual({ offsetDeg: -90, azimutDeg: 139, angleFacadeDeg: expect.closeTo(-103.13299614843544, 9), exclu: true });
  });
  it('Asnières : façade 61,5°, azimut 90° → 10 exclus (+63° à +90°)', () => {
    const e = calculerExclusion(90, 61.504361381460626);
    expect(e.vises.filter((f) => f.exclu).map((f) => f.offsetDeg)).toEqual([63, 66, 69, 72, 75, 78, 81, 84, 87, 90]);
    expect(e.secteurRetireDeg).toBe(30);
  });
  it('écart 0° → aucun faisceau exclu', () => {
    const e = calculerExclusion(229, 229);
    expect(e.n).toBe(0);
    expect(e.secteurRetireDeg).toBe(0);
    expect(e.ajoutesOffsetsDeg).toEqual([]);
  });
  it('mode Libre → rien d’exclu ; mode Façade sans pivot → rien à afficher', () => {
    expect(exclusionPourBanc('manuel', { azimutChoisiDeg: 229, azimutNormaleDeg: 242 })).toEqual({ mode: 'libre', n: 0 });
    expect(exclusionPourBanc('semi_auto', undefined)).toBeNull();
    expect(exclusionPourBanc('semi_auto', { azimutChoisiDeg: 229, azimutNormaleDeg: 242.13299614843544 })!.n).toBe(5);
  });
});
