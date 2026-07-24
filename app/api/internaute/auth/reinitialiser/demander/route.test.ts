import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * POST /api/internaute/auth/reinitialiser/demander. On MOCKE toutes les dépendances (throttle, résolution de compte,
 * jeton, e-mail). PREUVE CENTRALE : compte existant vs e-mail inconnu/effacé → réponse INDISTINGUABLE (même corps, même
 * statut) ET aucun e-mail envoyé dans le second cas. On prouve aussi : throttle AVANT résolution, réponse générique
 * même si bloqué, fail-safe, et absence totale de log (secret/e-mail).
 */
const { resoudreCredentialParEmail } = vi.hoisted(() => ({ resoudreCredentialParEmail: vi.fn() }));
const { cleThrottleReset, verifierThrottleReset, noterDemandeReset } = vi.hoisted(() => ({
  cleThrottleReset: vi.fn(),
  verifierThrottleReset: vi.fn(),
  noterDemandeReset: vi.fn(),
}));
const { creerJetonReset } = vi.hoisted(() => ({ creerJetonReset: vi.fn() }));
const { lireConfigEmail, obtenirTransporteur, envoyerReinitialisation } = vi.hoisted(() => ({
  lireConfigEmail: vi.fn(),
  obtenirTransporteur: vi.fn(),
  envoyerReinitialisation: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../../../../lib/internaute/authCredential', () => ({ resoudreCredentialParEmail }));
vi.mock('../../../../../lib/internaute/resetThrottle', () => ({ cleThrottleReset, verifierThrottleReset, noterDemandeReset }));
vi.mock('../../../../../lib/internaute/resetMotDePasse', () => ({ creerJetonReset }));
vi.mock('../../../../../lib/email', () => ({ lireConfigEmail, obtenirTransporteur, envoyerReinitialisation }));

import { POST } from './route';
import { MESSAGE_REINITIALISATION } from './presentation';

const req = (body: unknown, brut = false) =>
  new Request('http://localhost/api/internaute/auth/reinitialiser/demander', {
    method: 'POST',
    body: brut ? (body as string) : JSON.stringify(body),
  });

/** Configure le chemin nominal « compte existant + e-mail configuré ». */
function armerCompte(internauteId = 'A', secret = 'SECRET123') {
  verifierThrottleReset.mockResolvedValue({ bloque: false, retryAfter: 0 });
  resoudreCredentialParEmail.mockResolvedValue({ internauteId, hash: 'h' });
  creerJetonReset.mockResolvedValue(secret);
  lireConfigEmail.mockReturnValue({ host: 'h', port: 587, user: 'u', pass: 'p', from: 'noreply@sansvisavis.com' });
  obtenirTransporteur.mockReturnValue({ sendMail: vi.fn() });
  envoyerReinitialisation.mockResolvedValue(undefined);
}

describe('POST reinitialiser/demander — réponse générique uniforme, throttle en amont', () => {
  beforeEach(() => {
    for (const m of [resoudreCredentialParEmail, cleThrottleReset, verifierThrottleReset, noterDemandeReset, creerJetonReset, lireConfigEmail, obtenirTransporteur, envoyerReinitialisation]) m.mockReset();
    cleThrottleReset.mockReturnValue('cle-hachee');
    verifierThrottleReset.mockResolvedValue({ bloque: false, retryAfter: 0 });
    process.env.SITE_URL = 'https://www.sansvisavis.com';
  });
  afterEach(() => { delete process.env.SITE_URL; });

  it('compte existant → 200 générique + e-mail avec le secret DANS LE LIEN', async () => {
    armerCompte('A', 'SECRET123');
    const res = await POST(req({ email: 'jean@example.com' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: MESSAGE_REINITIALISATION });
    expect(creerJetonReset).toHaveBeenCalledWith('A');
    expect(envoyerReinitialisation).toHaveBeenCalledTimes(1);
    const [, from, mail] = envoyerReinitialisation.mock.calls[0];
    expect(from).toBe('noreply@sansvisavis.com');
    expect(mail).toEqual({ to: 'jean@example.com', lien: 'https://www.sansvisavis.com/espace/reinitialiser?j=SECRET123' });
  });

  it('e-mail INCONNU / effacé (résolution → null) → 200 générique, AUCUN jeton, AUCUN e-mail', async () => {
    resoudreCredentialParEmail.mockResolvedValue(null);
    const res = await POST(req({ email: 'inconnu@example.com' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: MESSAGE_REINITIALISATION });
    expect(creerJetonReset).not.toHaveBeenCalled();
    expect(envoyerReinitialisation).not.toHaveBeenCalled();
  });

  it('INDISTINGUABLE : compte existant et e-mail inconnu → même statut ET même corps', async () => {
    armerCompte();
    const r1 = await POST(req({ email: 'jean@example.com' }));
    const b1 = await r1.json();

    resoudreCredentialParEmail.mockResolvedValue(null);
    const r2 = await POST(req({ email: 'inconnu@example.com' }));
    const b2 = await r2.json();

    expect(r1.status).toBe(r2.status);
    expect(b1).toEqual(b2); // corps STRICTEMENT identique
  });

  it('THROTTLE bloqué → 200 générique, throttle NON révélé, résolution NON tentée (mais demande comptée)', async () => {
    verifierThrottleReset.mockResolvedValue({ bloque: true, retryAfter: 42 });
    const res = await POST(req({ email: 'jean@example.com' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: MESSAGE_REINITIALISATION });
    expect(res.headers.get('Retry-After')).toBeNull(); // aucun signal de rate-limit
    expect(noterDemandeReset).toHaveBeenCalledTimes(1); // la demande est comptée même bloquée
    expect(resoudreCredentialParEmail).not.toHaveBeenCalled(); // throttle AVANT la résolution
    expect(envoyerReinitialisation).not.toHaveBeenCalled();
  });

  it('ORDRE : throttle vérifié + demande notée AVANT toute résolution de compte', async () => {
    armerCompte();
    await POST(req({ email: 'jean@example.com' }));
    const ordreVerif = verifierThrottleReset.mock.invocationCallOrder[0];
    const ordreNote = noterDemandeReset.mock.invocationCallOrder[0];
    const ordreResol = resoudreCredentialParEmail.mock.invocationCallOrder[0];
    expect(ordreVerif).toBeLessThan(ordreResol);
    expect(ordreNote).toBeLessThan(ordreResol);
  });

  it('normalisation : e-mail trim + minuscules pour throttle, résolution ET destinataire', async () => {
    armerCompte();
    await POST(req({ email: '  JEAN@Example.COM ' }));
    expect(cleThrottleReset).toHaveBeenCalledWith('jean@example.com');
    expect(resoudreCredentialParEmail).toHaveBeenCalledWith('jean@example.com');
    expect(envoyerReinitialisation.mock.calls[0][2].to).toBe('jean@example.com');
  });

  it('corps invalide (non-JSON) → 200 générique, aucun traitement', async () => {
    const res = await POST(req('pas du json', true));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: MESSAGE_REINITIALISATION });
    expect(verifierThrottleReset).not.toHaveBeenCalled();
    expect(envoyerReinitialisation).not.toHaveBeenCalled();
  });

  it('e-mail absent / vide → 200 générique, aucun traitement', async () => {
    expect((await POST(req({}))).status).toBe(200);
    expect((await POST(req({ email: '   ' }))).status).toBe(200);
    expect(verifierThrottleReset).not.toHaveBeenCalled();
  });

  it('FAIL-SAFE : résolution de compte qui LÈVE → 200 générique, aucun e-mail (pas d’enfermement, pas de fuite)', async () => {
    resoudreCredentialParEmail.mockRejectedValue(new Error('db down'));
    const res = await POST(req({ email: 'jean@example.com' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: MESSAGE_REINITIALISATION });
    expect(creerJetonReset).not.toHaveBeenCalled();
    expect(envoyerReinitialisation).not.toHaveBeenCalled();
  });

  it('SITE_URL absente → 200 générique, aucun e-mail (mais jeton créé sans fuite)', async () => {
    delete process.env.SITE_URL;
    armerCompte();
    const res = await POST(req({ email: 'jean@example.com' }));
    expect(res.status).toBe(200);
    expect(envoyerReinitialisation).not.toHaveBeenCalled();
  });

  it('ne logge JAMAIS (ni e-mail, ni secret, ni jeton)', async () => {
    const spies = ['log', 'error', 'warn', 'info'].map((m) => vi.spyOn(console, m as 'log').mockImplementation(() => {}));
    armerCompte('A', 'SECRET123');
    await POST(req({ email: 'jean@example.com' }));
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    for (const s of spies) s.mockRestore();
  });
});
