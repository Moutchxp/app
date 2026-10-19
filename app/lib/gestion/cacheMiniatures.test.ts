import { describe, expect, it } from 'vitest';
import { CacheMiniatures } from './cacheMiniatures';

describe('le cache des vignettes non déposées : en mémoire, borné', () => {
  it('garde, relit, oublie', () => {
    const c = new CacheMiniatures(3, 1000);
    c.garder(1, Buffer.from('a'));
    expect(c.lire(1)?.toString()).toBe('a');
    c.oublier(1);
    expect(c.lire(1)).toBeNull();
    expect(c.taille).toEqual({ entrees: 0, octets: 0 });
  });
  it('au-delà du nombre d’entrées, la moins récemment lue sort', () => {
    const c = new CacheMiniatures(2, 1000);
    c.garder(1, Buffer.from('a')); c.garder(2, Buffer.from('b'));
    c.lire(1);
    c.garder(3, Buffer.from('c'));
    expect([c.lire(1) !== null, c.lire(2) !== null, c.lire(3) !== null]).toEqual([true, false, true]);
  });
  it('au-delà du poids total, les plus anciennes sortent ; une vignette trop lourde ou vide n’entre pas', () => {
    const c = new CacheMiniatures(10, 10);
    c.garder(1, Buffer.alloc(6)); c.garder(2, Buffer.alloc(6));
    expect(c.lire(1)).toBeNull();
    expect(c.taille.octets).toBe(6);
    c.garder(3, Buffer.alloc(11)); c.garder(4, Buffer.alloc(0));
    expect([c.lire(3), c.lire(4)]).toEqual([null, null]);
  });
});
