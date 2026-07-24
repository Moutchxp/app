import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));
// `signerSession` lit désormais `internaute_auth.maj_a` (F1) → on MOCKE le lecteur pour éviter toute base réelle.
const { lireMajCredential } = vi.hoisted(() => ({ lireMajCredential: vi.fn() }));
vi.mock('./credentialMaj', () => ({ lireMajCredential }));
import { signerSession, verifierSession, verifierSessionDetail, NOM_COOKIE_CLIENT, optionsCookieClient, ttlSecondes } from './authSession';

const ORIG = { ...process.env };
beforeEach(() => {
  process.env.INTERNAUTE_SESSION_SECRET = 'secret-de-test-au-moins-32-octets-abcdefgh';
  delete process.env.SESSION_INTERNAUTE_TTL;
  lireMajCredential.mockReset().mockResolvedValue('2026-07-24 21:00:00.123456+00'); // credential présent par défaut
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

describe('authSession — F1 : scellage INERTE du cev (maj_a du credential)', () => {
  const uuid = '22222222-2222-2222-2222-222222222222';

  it('signerSession scelle le cev lu (maj_a pleine précision) → verifierSessionDetail l’expose', async () => {
    lireMajCredential.mockResolvedValue('2026-07-24 21:00:00.123456+00');
    const t = await signerSession(uuid);
    expect(lireMajCredential).toHaveBeenCalledWith(uuid); // lu AVANT de signer
    expect(await verifierSessionDetail(t)).toEqual({ sub: uuid, cev: '2026-07-24 21:00:00.123456+00' });
  });

  it('la précision fine (microsecondes) est conservée telle quelle dans le jeton', async () => {
    lireMajCredential.mockResolvedValue('2026-07-24 21:00:00.999999+00');
    const t = await signerSession(uuid);
    expect((await verifierSessionDetail(t))?.cev).toBe('2026-07-24 21:00:00.999999+00'); // pas tronqué à la seconde
  });

  it('pas de credential (maj_a null) → claim cev OMISE → cev exposé = null', async () => {
    lireMajCredential.mockResolvedValue(null);
    const t = await signerSession(uuid);
    expect(await verifierSessionDetail(t)).toEqual({ sub: uuid, cev: null });
  });

  it('CONTRAT INCHANGÉ : verifierSession renvoie toujours le sub SEUL (jamais le cev)', async () => {
    lireMajCredential.mockResolvedValue('2026-07-24 21:00:00.123456+00');
    const t = await signerSession(uuid);
    expect(await verifierSession(t)).toBe(uuid); // string, pas un objet → la garde F1 est intacte
  });

  it('jeton legacy (aucun cev scellé) → verifierSessionDetail expose cev=null, sub intact (rétrocompatibilité)', async () => {
    // Simulé : un signataire qui n'aurait pas de credential → aucun cev dans le jeton (équivaut à un jeton pré-F1).
    lireMajCredential.mockResolvedValue(null);
    const t = await signerSession(uuid);
    const d = await verifierSessionDetail(t);
    expect(d?.sub).toBe(uuid);
    expect(d?.cev).toBeNull();
    expect(await verifierSession(t)).toBe(uuid); // rien n'est refusé sur la base d'un cev absent (F1 inerte)
  });

  it('jeton falsifié / mauvais secret → verifierSessionDetail = null (comme verifierSession)', async () => {
    const t = await signerSession(uuid);
    expect(await verifierSessionDetail(t + 'x')).toBeNull();
  });
});
