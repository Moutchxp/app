import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./pool', () => ({ queryAnalytics: vi.fn() }));

import { communeDuPoint } from './commune';
import { queryAnalytics } from './pool';

const q = queryAnalytics as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => vi.clearAllMocks());

describe('communeDuPoint — dérive l’INSEE (KNN adresse_ban), ne renvoie QUE le code', () => {
  it('émet le KNN en Lambert-93 sur adresse_ban et renvoie l’INSEE validé', async () => {
    q.mockResolvedValueOnce({ rows: [{ insee: '92004' }], rowCount: 1 });
    const insee = await communeDuPoint(48.90693, 2.269431);
    expect(insee).toBe('92004');
    const [sql, params] = q.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/from adresse_ban/i);
    expect(sql).toMatch(/geom <-> st_transform\(st_setsrid\(st_makepoint\(\$1, \$2\), 4326\), 2154\)/i);
    expect(sql).toMatch(/limit 1/i);
    expect(params).toEqual([2.269431, 48.90693]); // ST_MakePoint(x=lon, y=lat)
  });

  it('un résultat non conforme (ex. bruit) est rejeté → null', async () => {
    q.mockResolvedValueOnce({ rows: [{ insee: 'pas-un-insee' }], rowCount: 1 });
    expect(await communeDuPoint(48.9, 2.2)).toBeNull();
  });

  it('coordonnées non finies → null, sans requête', async () => {
    expect(await communeDuPoint(NaN, 2.2)).toBeNull();
    expect(await communeDuPoint(48.9, Infinity)).toBeNull();
    expect(q).not.toHaveBeenCalled();
  });

  it('NE THROW JAMAIS : une erreur base → null', async () => {
    q.mockRejectedValueOnce(new Error('DB down'));
    await expect(communeDuPoint(48.9, 2.2)).resolves.toBeNull();
  });
});
