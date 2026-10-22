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

  // Arno (22/10/2026) — distance_max_m = plafond des faisceaux nature, borné portée (200) ≤ v ≤ 500 : 250 est désormais ACCEPTÉ.
  it('distance_max_m (250), entre la portée (200) et 500 → actif', () => {
    const r = evaluerRepli({ mode_combinaison: 'max', distance_max_m: 250, analysis_range_m: 200 });
    expect(r.actif).toBe(true);
  });
  it('distance_max_m 300 et 500 acceptés ; 150 (sous la portée) et 600 (au-delà de 500) → repli', () => {
    for (const v of [300, 500]) expect(evaluerRepli({ mode_combinaison: 'max', distance_max_m: v, analysis_range_m: 200 }).actif).toBe(true);
    for (const v of [150, 600]) {
      const r = evaluerRepli({ mode_combinaison: 'max', distance_max_m: v, analysis_range_m: 200 });
      expect(r.actif).toBe(false);
      expect(r.raisons.some((x) => x.includes('distance_max_m'))).toBe(true);
    }
  });

  it('conforme (mode=max, 200 ≤ 200) → actif, aucune raison', () => {
    const r = evaluerRepli({ mode_combinaison: 'max', distance_max_m: 200, analysis_range_m: 200 });
    expect(r.actif).toBe(true);
    expect(r.raisons).toEqual([]);
  });
});
