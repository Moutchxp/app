import { describe, it, expect, beforeEach, vi } from 'vitest';

// On mocke tout le domaine auth (credential/session/throttle) + `next/headers` : on teste la LOGIQUE de la route —
// verify TOUJOURS exécuté (temps constant), échec GÉNÉRIQUE, throttle amont, cookie au succès. argon2/DB réels sont
// prouvés dans authCredential.test.ts.
const { resoudreCredentialParEmail, verifier } = vi.hoisted(() => ({ resoudreCredentialParEmail: vi.fn(), verifier: vi.fn() }));
const { cleThrottle, verifierThrottle, noterEchec, noterSucces } = vi.hoisted(() => ({
  cleThrottle: vi.fn(() => 'cle'),
  verifierThrottle: vi.fn(),
  noterEchec: vi.fn(),
  noterSucces: vi.fn(),
}));
const { signerSession, optionsCookieClient } = vi.hoisted(() => ({ signerSession: vi.fn(), optionsCookieClient: vi.fn(() => ({})) }));
const cookieStore = { set: vi.fn(), delete: vi.fn() };

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => cookieStore) }));
vi.mock('../../../../lib/internaute/authCredential', () => ({ resoudreCredentialParEmail, verifier }));
vi.mock('../../../../lib/internaute/authThrottle', () => ({ cleThrottle, verifierThrottle, noterEchec, noterSucces }));
vi.mock('../../../../lib/internaute/authSession', () => ({ signerSession, optionsCookieClient, NOM_COOKIE_CLIENT: 'svv_client_session' }));

import { POST } from './route';

function req(body: unknown): Request {
  return new Request('http://localhost/api/internaute/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/internaute/auth/login', () => {
  beforeEach(() => {
    resoudreCredentialParEmail.mockReset();
    verifier.mockReset();
    verifierThrottle.mockReset().mockResolvedValue({ bloque: false, retryAfter: 0 });
    noterEchec.mockReset();
    noterSucces.mockReset();
    signerSession.mockReset();
    cookieStore.set.mockReset();
  });

  it('e-mail INCONNU → verify de LEURRE EXÉCUTÉ (temps constant), échec GÉNÉRIQUE 401, aucun cookie', async () => {
    resoudreCredentialParEmail.mockResolvedValue(null); // inconnu / sans compte / effacé
    verifier.mockResolvedValue(false);
    const res = await POST(req({ email: 'inconnu@example.com', motDePasse: 'peuimporte12' }));
    expect(res.status).toBe(401);
    expect(verifier).toHaveBeenCalledTimes(1); // verify TOUJOURS appelé (leurre) → pas de fuite d'existence
    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(noterEchec).toHaveBeenCalledTimes(1);
  });

  it('mauvais mot de passe (compte existant) → MÊME échec générique 401', async () => {
    resoudreCredentialParEmail.mockResolvedValue({ internauteId: 'uuid-1', hash: '$argon2id$reel' });
    verifier.mockResolvedValue(false);
    const res = await POST(req({ email: 'a@b.com', motDePasse: 'mauvaispass12' }));
    expect(res.status).toBe(401);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it('succès → cookie de session posé + reset du throttle', async () => {
    resoudreCredentialParEmail.mockResolvedValue({ internauteId: 'uuid-1', hash: '$argon2id$reel' });
    verifier.mockResolvedValue(true);
    signerSession.mockResolvedValue('JETON_SESSION');
    const res = await POST(req({ email: 'a@b.com', motDePasse: 'bonmotdepasse12' }));
    expect(res.status).toBe(200);
    expect(cookieStore.set).toHaveBeenCalledWith('svv_client_session', 'JETON_SESSION', expect.anything());
    expect(noterSucces).toHaveBeenCalledTimes(1);
  });

  it('THROTTLÉ → 429 + Retry-After, AUCUNE vérification', async () => {
    verifierThrottle.mockResolvedValue({ bloque: true, retryAfter: 42 });
    const res = await POST(req({ email: 'a@b.com', motDePasse: 'x' }));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('42');
    expect(verifier).not.toHaveBeenCalled();
  });

  it('e-mail vide → échec générique 401, aucune vérification', async () => {
    const res = await POST(req({ email: '   ', motDePasse: 'x' }));
    expect(res.status).toBe(401);
    expect(verifier).not.toHaveBeenCalled();
  });
});
