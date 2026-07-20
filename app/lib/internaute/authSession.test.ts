import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import { signerSession, verifierSession, NOM_COOKIE_CLIENT, optionsCookieClient, ttlSecondes } from './authSession';

const ORIG = { ...process.env };
beforeEach(() => {
  process.env.INTERNAUTE_SESSION_SECRET = 'secret-de-test-au-moins-32-octets-abcdefgh';
  delete process.env.SESSION_INTERNAUTE_TTL;
});
afterEach(() => {
  process.env = { ...ORIG };
});

describe('authSession — JWS internaute (secret + cookie DÉDIÉS, distincts de l’admin)', () => {
  it('signe puis vérifie → renvoie le sub (UUID)', async () => {
    const uuid = '11111111-1111-1111-1111-111111111111';
    const t = await signerSession(uuid);
    expect(await verifierSession(t)).toBe(uuid);
  });

  it('jeton falsifié → null', async () => {
    const t = await signerSession('uuid-1');
    expect(await verifierSession(t + 'falsif')).toBeNull();
  });

  it('secret DIFFÉRENT → null (isolation cryptographique)', async () => {
    const t = await signerSession('uuid-1');
    process.env.INTERNAUTE_SESSION_SECRET = 'un-autre-secret-different-au-moins-32-oct';
    expect(await verifierSession(t)).toBeNull();
  });

  it('cookie : SameSite=Lax (PAS strict), httpOnly, secure en prod ; nom dédié ; TTL défaut = 30 jours', () => {
    const o = optionsCookieClient(true);
    expect(o.sameSite).toBe('lax');
    expect(o.httpOnly).toBe(true);
    expect(o.secure).toBe(true);
    expect(o.path).toBe('/');
    expect(NOM_COOKIE_CLIENT).toBe('svv_client_session');
    expect(ttlSecondes()).toBe(30 * 24 * 3600);
  });

  it('TTL piloté par SESSION_INTERNAUTE_TTL', () => {
    process.env.SESSION_INTERNAUTE_TTL = '604800';
    expect(ttlSecondes()).toBe(604800);
  });
});
