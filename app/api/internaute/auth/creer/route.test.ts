import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * POST /api/internaute/auth/creer (Commit B) — on mocke le domaine (jeton, création de compte, session) + `next/headers`
 * pour tester la LOGIQUE de la route : OWNERSHIP par jeton (id = `sub`, JAMAIS le corps → IDOR fermé), cookie de session
 * au succès, ZÉRO consentement (le module de consentement n'est même pas importé), mapping des refus.
 */
const { verifierJetonRectification } = vi.hoisted(() => ({ verifierJetonRectification: vi.fn() }));
const { creerCompteInternaute } = vi.hoisted(() => ({ creerCompteInternaute: vi.fn() }));
const { signerSession, optionsCookieClient } = vi.hoisted(() => ({
  signerSession: vi.fn(),
  optionsCookieClient: vi.fn(() => ({})),
}));
const cookieStore = { set: vi.fn(), delete: vi.fn() };

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => cookieStore) }));
vi.mock('../../../../lib/internaute/jetonRectification', () => ({ verifierJetonRectification }));
// Cadence mockée PASSANTE : la route est testée pour sa logique d'ownership, pas pour le limiteur (testé ailleurs).
// Sans ce mock, le test taperait la vraie base et consommerait un quota réel.
const { verifierCadence } = vi.hoisted(() => ({ verifierCadence: vi.fn() }));
vi.mock('../../../../lib/cadence/limiteur', () => ({ verifierCadence, purgerCadence: vi.fn() }));
vi.mock('../../../../lib/internaute/authCompte', () => ({ creerCompteInternaute }));
vi.mock('../../../../lib/internaute/authSession', () => ({
  signerSession,
  optionsCookieClient,
  NOM_COOKIE_CLIENT: 'svv_client_session',
}));

import { POST } from './route';

function req(body: unknown): Request {
  return new Request('http://localhost/api/internaute/auth/creer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/internaute/auth/creer', () => {
  beforeEach(() => {
    verifierCadence.mockResolvedValue({ autorise: true, retryApresS: 0, code: 'cadence_depassee', sansCompte: true });
    verifierJetonRectification.mockReset();
    creerCompteInternaute.mockReset();
    signerSession.mockReset();
    cookieStore.set.mockReset();
  });

  it('jeton absent/invalide → 401, aucune création, aucun cookie', async () => {
    verifierJetonRectification.mockResolvedValue(null);
    const res = await POST(req({ jeton: 'pourri', motDePasse: 'motdepasse-solide-1' }));
    expect(res.status).toBe(401);
    expect(creerCompteInternaute).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it('succès → compte créé pour l’id DU JETON (jamais du corps), cookie de session posé', async () => {
    verifierJetonRectification.mockResolvedValue('uuid-proprietaire');
    creerCompteInternaute.mockResolvedValue({ ok: true });
    signerSession.mockResolvedValue('JETON_SESSION');
    // Le corps tente d'imposer un AUTRE id → doit être IGNORÉ (parade IDOR : seul le `sub` du jeton agit).
    const res = await POST(req({ jeton: 'ok', motDePasse: 'motdepasse-solide-1', internauteId: 'uuid-attaquant' }));

    expect(res.status).toBe(200);
    expect(creerCompteInternaute).toHaveBeenCalledWith('uuid-proprietaire', 'motdepasse-solide-1');
    expect(cookieStore.set).toHaveBeenCalledWith('svv_client_session', 'JETON_SESSION', expect.anything());
  });

  it('mot de passe non conforme → 422, aucun cookie', async () => {
    verifierJetonRectification.mockResolvedValue('uuid-1');
    creerCompteInternaute.mockResolvedValue({ ok: false, raison: 'mot_de_passe_invalide', erreurs: ['trop court'] });
    const res = await POST(req({ jeton: 'ok', motDePasse: 'court' }));
    expect(res.status).toBe(422);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it('dossier introuvable/effacé → 404, aucun cookie', async () => {
    verifierJetonRectification.mockResolvedValue('uuid-1');
    creerCompteInternaute.mockResolvedValue({ ok: false, raison: 'dossier_introuvable' });
    const res = await POST(req({ jeton: 'ok', motDePasse: 'motdepasse-solide-1' }));
    expect(res.status).toBe(404);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
});

/** Cadence (résidu G4) — défense en profondeur : le jeton-capacité reste le verrou principal. */
describe('POST /api/internaute/auth/creer — limitation de cadence', () => {
  beforeEach(() => {
    verifierCadence.mockReset();
    verifierCadence.mockResolvedValue({ autorise: true, retryApresS: 0, code: 'cadence_depassee', sansCompte: true });
    verifierJetonRectification.mockReset();
    creerCompteInternaute.mockReset();
    cookieStore.set.mockReset();
  });

  it('au seuil → 429 + Retry-After, AUCUN compte créé, AUCUN cookie', async () => {
    verifierCadence.mockResolvedValueOnce({ autorise: false, retryApresS: 3000, code: 'cadence_depassee', sansCompte: true });
    verifierJetonRectification.mockResolvedValue('internaute-A');
    const res = await POST(req({ jeton: 'j', motDePasse: 'motdepassevalide123' }));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('3000');
    expect((await res.json()).code).toBe('cadence_depassee');
    expect(creerCompteInternaute).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it('la cadence est vérifiée APRÈS le jeton : un jeton invalide reste un 401 et ne consomme pas de quota', async () => {
    verifierJetonRectification.mockResolvedValue(null);
    const res = await POST(req({ jeton: 'faux', motDePasse: 'x' }));
    expect(res.status).toBe(401);
    expect(verifierCadence).not.toHaveBeenCalled();
  });
});
