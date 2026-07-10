import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./pool', () => ({ queryAnalytics: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }) }));

import { majSession } from './session';
import { queryAnalytics } from './pool';

const V4 = '11111111-1111-4111-8111-111111111111';
const q = queryAnalytics as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe('majSession — UPSERT session éphémère (climb etape_max, coalesce acquisition, complete)', () => {
  it('émet l’UPSERT : array_position (rang), COALESCE (provenance non écrasée), ON CONFLICT PK', async () => {
    await majSession(V4, 'photo', { source: 'insta', deviceType: 'mobile', navigateurFamille: 'Chrome' });
    expect(q).toHaveBeenCalledTimes(1);
    const [sql, params] = q.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/insert into analytics_session/i);
    expect(sql).toMatch(/array_position\(array\['intro','photo','localisation','axe','infos_logement','analyse','resultat'\]/i);
    expect(sql).toMatch(/coalesce\(analytics_session\.source, excluded\.source\)/i);
    expect(sql).toMatch(/on conflict on constraint analytics_session_pk/i);
    // params = [sid, jour, etape, source, medium, campagne, referer, device, nav, complete]
    expect(params[0]).toBe(V4);
    expect(params[2]).toBe('photo');
    expect(params[3]).toBe('insta');
    expect(params[7]).toBe('mobile');
    expect(params[8]).toBe('Chrome');
    expect(params[9]).toBe(false); // photo ≠ resultat
  });

  it('complete=true UNIQUEMENT à l’étape resultat', async () => {
    await majSession(V4, 'resultat');
    expect((q.mock.calls[0][1] as unknown[])[9]).toBe(true);
  });

  it('NE THROW JAMAIS, même si la base rejette (best-effort)', async () => {
    q.mockRejectedValueOnce(new Error('pool full'));
    await expect(majSession(V4, 'intro')).resolves.toBeUndefined();
  });

  it('no-op silencieux (aucune requête) sur une étape hors enum', async () => {
    await majSession(V4, 'ecran_inconnu' as never);
    expect(q).not.toHaveBeenCalled();
  });
});
