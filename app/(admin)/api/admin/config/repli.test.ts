import { describe, it, expect } from 'vitest';
import { evaluerRepli } from './repli';

describe('evaluerRepli — 3 conditions de repli', () => {
  it('ligne absente (null) → repli « profil absent »', () => {
    const r = evaluerRepli(null);
    expect(r.actif).toBe(false);
    expect(r.raisons.length).toBe(1);
    expect(r.raisons[0]).toContain('absent');
  });

  it('mode_combinaison invalide → repli', () => {
    const r = evaluerRepli({ mode_combinaison: 'foo', distance_max_m: 200, analysis_range_m: 200 });
    expect(r.actif).toBe(false);
    expect(r.raisons.some((x) => x.includes('mode_combinaison'))).toBe(true);
  });

  it('distance_max_m (250) > analysis_range_m (200) → repli', () => {
    const r = evaluerRepli({ mode_combinaison: 'max', distance_max_m: 250, analysis_range_m: 200 });
    expect(r.actif).toBe(false);
    expect(r.raisons.some((x) => x.includes('distance_max_m'))).toBe(true);
  });

  it('conforme (mode=max, 200 ≤ 200) → actif, aucune raison', () => {
    const r = evaluerRepli({ mode_combinaison: 'max', distance_max_m: 200, analysis_range_m: 200 });
    expect(r.actif).toBe(true);
    expect(r.raisons).toEqual([]);
  });
});
