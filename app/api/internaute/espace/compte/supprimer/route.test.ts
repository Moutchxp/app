import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * POST /api/internaute/espace/compte/supprimer. On mocke la garde, la vérif de mot de passe, le throttle, l'effacement
 * et `cookies`. PREUVES : ordre (throttle → vérif → effacement) ; mot de passe faux → 401 + AUCUN effacement + throttle ;
 * id du corps IGNORÉ (id de session) ; effacement avec auteur=null + canal='espace_client' ; session détruite au succès.
 */
const { exigerInternaute } = vi.hoisted(() => ({ exigerInternaute: vi.fn() }));
const { resoudreHashParId, verifier } = vi.hoisted(() => ({ resoudreHashParId: vi.fn(), verifier: vi.fn() }));
const { cleThrottleSuppression, verifierThrottle, noterEchec, noterSucces } = vi.hoisted(() => ({
  cleThrottleSuppression: vi.fn(() => 'CLE'), verifierThrottle: vi.fn(), noterEchec: vi.fn(), noterSucces: vi.fn(),
}));
const { effacerInternaute } = vi.hoisted(() => ({ effacerInternaute: vi.fn() }));
const cookieStore = { delete: vi.fn(), set: vi.fn() };

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => cookieStore) }));
vi.mock('../../../../../lib/internaute/authGarde', () => ({ exigerInternaute }));
vi.mock('../../../../../lib/internaute/authCredential', () => ({ resoudreHashParId, verifier }));
vi.mock('../../../../../lib/internaute/authThrottle', () => ({ cleThrottleSuppression, verifierThrottle, noterEchec, noterSucces }));
vi.mock('../../../../../lib/internaute/cycleVie', () => ({ effacerInternaute }));
vi.mock('../../../../../lib/internaute/authSession', () => ({ NOM_COOKIE_CLIENT: 'svv_client_session' }));

import { POST } from './route';

const req = (body: unknown, brut = false) =>
  new Request('http://localhost/api/internaute/espace/compte/supprimer', {
    method: 'POST',
    body: brut ? (body as string) : JSON.stringify(body),
  });

describe('POST compte/supprimer — suppression destructive gardée', () => {
  beforeEach(() => {
    exigerInternaute.mockReset().mockResolvedValue({ internauteId: 'SESSION' });
    resoudreHashParId.mockReset().mockResolvedValue('HASH');
    verifier.mockReset().mockResolvedValue(true);
    verifierThrottle.mockReset().mockResolvedValue({ bloque: false, retryAfter: 0 });
    noterEchec.mockReset();
    noterSucces.mockReset();
    effacerInternaute.mockReset().mockResolvedValue({ efface: true });
    cookieStore.delete.mockReset();
  });

  it('succès → efface (id SESSION, auteur null, canal espace_client), session détruite, 200', async () => {
    const res = await POST(req({ motDePasse: 'bonMotDePasse' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(verifier).toHaveBeenCalledWith('bonMotDePasse', 'HASH');
    expect(effacerInternaute).toHaveBeenCalledWith('SESSION', null, 'espace_client'); // id session, PAS admin, canal J1
    expect(cookieStore.delete).toHaveBeenCalledWith({ name: 'svv_client_session', path: '/' });
    expect(noterSucces).toHaveBeenCalledTimes(1);
  });

  it('mot de passe FAUX → 401, AUCUN effacement, throttle incrémenté, session intacte', async () => {
    verifier.mockResolvedValue(false);
    const res = await POST(req({ motDePasse: 'mauvais' }));
    expect(res.status).toBe(401);
    expect(effacerInternaute).not.toHaveBeenCalled();
    expect(noterEchec).toHaveBeenCalledTimes(1);
    expect(cookieStore.delete).not.toHaveBeenCalled();
  });

  it('id du CORPS ignoré : on efface TOUJOURS l’id de session', async () => {
    await POST(req({ id: 'AUTRE-INTERNAUTE', motDePasse: 'bonMotDePasse' }));
    expect(effacerInternaute.mock.calls[0][0]).toBe('SESSION'); // jamais 'AUTRE-INTERNAUTE'
  });

  it('THROTTLE bloqué → 429 + Retry-After, AUCUNE vérif ni effacement (ordre respecté)', async () => {
    verifierThrottle.mockResolvedValue({ bloque: true, retryAfter: 42 });
    const res = await POST(req({ motDePasse: 'x' }));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('42');
    expect(verifier).not.toHaveBeenCalled();
    expect(effacerInternaute).not.toHaveBeenCalled();
  });

  it('hash absent (dossier sans credential) → 401 + noterEchec, aucun effacement', async () => {
    resoudreHashParId.mockResolvedValue(null);
    const res = await POST(req({ motDePasse: 'x' }));
    expect(res.status).toBe(401);
    expect(verifier).not.toHaveBeenCalled(); // court-circuit : pas de hash → pas de vérif
    expect(effacerInternaute).not.toHaveBeenCalled();
    expect(noterEchec).toHaveBeenCalledTimes(1);
  });

  it('non authentifié → renvoie le refus de la garde (401), rien n’est fait', async () => {
    exigerInternaute.mockResolvedValue({ refus: Response.json({ erreur: 'non authentifié' }, { status: 401 }) });
    const res = await POST(req({ motDePasse: 'x' }));
    expect(res.status).toBe(401);
    expect(verifierThrottle).not.toHaveBeenCalled();
    expect(effacerInternaute).not.toHaveBeenCalled();
  });

  it('corps non-JSON → 400, aucun effacement', async () => {
    const res = await POST(req('pas du json', true));
    expect(res.status).toBe(400);
    expect(effacerInternaute).not.toHaveBeenCalled();
  });
});
