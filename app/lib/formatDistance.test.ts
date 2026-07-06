import { describe, it, expect } from 'vitest';
import { metresVerdictAffiches, formaterDistanceVerdict } from './formatDistance';

describe('metresVerdictAffiches — Math.round partout, exception [39;40[ → 39', () => {
  it.each([
    // tranche seuil [39,00 ; 39,99] → FORCÉE à 39 (jamais 40), y compris 39,99 (que Math.round mettrait à 40)
    [39.0, 39],
    [39.49, 39],
    [39.8, 39],
    [39.99, 39],
    // >= 40 : arrondi au plus proche
    [40.0, 40],
    [40.3, 40],
    [40.49, 40],
    [40.51, 41],
    [40.99, 41],
    [42.100339602923526, 42], // distance-verdict brute du golden Asnières
  ])('metresVerdictAffiches(%f) === %i', (d, attendu) => {
    expect(metresVerdictAffiches(d)).toBe(attendu);
  });

  it('null → null', () => {
    expect(metresVerdictAffiches(null)).toBeNull();
  });
  it('non fini (Infinity) → null', () => {
    expect(metresVerdictAffiches(Infinity)).toBeNull();
  });
});

describe('formaterDistanceVerdict — « X m » / « Aucun (≥ 200 m) »', () => {
  it('39,8 → « 39 m » (sous le seuil, cohérent avec vis-à-vis)', () => {
    expect(formaterDistanceVerdict(39.8)).toBe('39 m');
  });
  it('40,51 → « 41 m »', () => {
    expect(formaterDistanceVerdict(40.51)).toBe('41 m');
  });
  it('42,10 → « 42 m » (golden Asnières)', () => {
    expect(formaterDistanceVerdict(42.100339602923526)).toBe('42 m');
  });
  it('null → « Aucun (≥ 200 m) » (inchangé)', () => {
    expect(formaterDistanceVerdict(null)).toBe('Aucun (≥ 200 m)');
  });
});
