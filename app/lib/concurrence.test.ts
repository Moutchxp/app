import { describe, it, expect } from 'vitest';
import { mapConcurrenceBornee } from './concurrence';

const attendre = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe('mapConcurrenceBornee — concurrence plafonnée, ordre déterministe', () => {
  it('🔴 JAMAIS plus de `limite` opérations simultanées', async () => {
    let actifs = 0, maxActifs = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);
    await mapConcurrenceBornee(items, 3, async (x) => {
      actifs += 1; maxActifs = Math.max(maxActifs, actifs);
      await attendre(2);
      actifs -= 1;
      return x;
    });
    expect(maxActifs).toBeLessThanOrEqual(3);
    expect(maxActifs).toBeGreaterThan(1); // la concurrence est bien EXPLOITÉE (pas du série déguisé)
  });

  it('🔴 ORDRE des résultats = ordre des ENTRÉES (jamais l’ordre d’arrivée)', async () => {
    const items = [30, 5, 15]; // délais : le 1er finit EN DERNIER
    const r = await mapConcurrenceBornee(items, 3, async (ms) => { await attendre(ms); return ms; });
    expect(r).toEqual([30, 5, 15]); // ordre d'entrée, PAS [5, 15, 30]
  });

  it('applique fn à tous, résultat par position (index fourni)', async () => {
    const r = await mapConcurrenceBornee(['a', 'b', 'c', 'd'], 2, async (s, i) => `${i}:${s}`);
    expect(r).toEqual(['0:a', '1:b', '2:c', '3:d']);
  });

  it('liste vide → [] ; limite ≤ 0 ramenée à 1 (jamais 0 worker) ; limite > n bornée à n', async () => {
    expect(await mapConcurrenceBornee([], 4, async () => 1)).toEqual([]);
    expect(await mapConcurrenceBornee([1, 2], 0, async (x) => x * 10)).toEqual([10, 20]);
    expect(await mapConcurrenceBornee([1, 2], 999, async (x) => x * 10)).toEqual([10, 20]);
  });

  it('une exception de fn REJETTE la promesse globale (sémantique Promise.all)', async () => {
    await expect(mapConcurrenceBornee([1, 2, 3], 2, async (x) => { if (x === 2) throw new Error('boom'); return x; })).rejects.toThrow('boom');
  });
});
