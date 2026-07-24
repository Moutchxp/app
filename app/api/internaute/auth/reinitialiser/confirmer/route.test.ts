import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * POST /api/internaute/auth/reinitialiser/confirmer. On MOCKE le domaine (politique/pose credential, consommation du
 * jeton, session, `next/headers`) : on teste la LOGIQUE de la route. PREUVES DEMANDÉES :
 *  (a) un mot de passe faible NE consomme PAS le jeton (validation AVANT consommation) ;
 *  (b) un jeton rejoué échoue (single-use : 2e consommation → null → 400, aucune pose) ;
 *  (c) l'historique reste intact : l'internaute_id circule INCHANGÉ (consommation → pose → session), aucune identité
 *      recréée, et rien d'autre que `internaute_auth` (via poserMotDePasse) n'est touché.
 */
const { politiqueMotDePasse, poserMotDePasse } = vi.hoisted(() => ({ politiqueMotDePasse: vi.fn(), poserMotDePasse: vi.fn() }));
const { consommerJetonReset } = vi.hoisted(() => ({ consommerJetonReset: vi.fn() }));
const { signerSession, optionsCookieClient } = vi.hoisted(() => ({ signerSession: vi.fn(), optionsCookieClient: vi.fn(() => ({ httpOnly: true })) }));
const cookieStore = { set: vi.fn(), delete: vi.fn() };

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => cookieStore) }));
vi.mock('../../../../../lib/internaute/authCredential', () => ({ politiqueMotDePasse, poserMotDePasse }));
vi.mock('../../../../../lib/internaute/resetMotDePasse', () => ({ consommerJetonReset }));
vi.mock('../../../../../lib/internaute/authSession', () => ({ signerSession, optionsCookieClient, NOM_COOKIE_CLIENT: 'svv_client_session' }));

import { POST } from './route';
import { MSG_CONFIRMATION_DIVERGE, MSG_LIEN_INVALIDE } from './presentation';

const BON = 'motDePasseValide12';
const req = (body: unknown, brut = false) =>
  new Request('http://localhost/api/internaute/auth/reinitialiser/confirmer', {
    method: 'POST',
    body: brut ? (body as string) : JSON.stringify(body),
  });

describe('POST reinitialiser/confirmer — pose du nouveau mot de passe', () => {
  beforeEach(() => {
    for (const m of [politiqueMotDePasse, poserMotDePasse, consommerJetonReset, signerSession, optionsCookieClient, cookieStore.set]) m.mockReset();
    politiqueMotDePasse.mockReturnValue({ ok: true, erreurs: [] }); // fort par défaut ; surchargé au besoin
    optionsCookieClient.mockReturnValue({ httpOnly: true });
  });

  it('succès → mot de passe posé pour l’id du jeton, session ouverte, 200', async () => {
    consommerJetonReset.mockResolvedValue('INT-42');
    signerSession.mockResolvedValue('JETON_SESSION');
    const res = await POST(req({ jeton: 'SECRET', motDePasse: BON, motDePasseConfirmation: BON }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(poserMotDePasse).toHaveBeenCalledWith('INT-42', BON);
    expect(cookieStore.set).toHaveBeenCalledWith('svv_client_session', 'JETON_SESSION', { httpOnly: true });
  });

  // ── (a) mot de passe faible → 400 explicite, JETON NON CONSOMMÉ ──
  it('(a) mot de passe FAIBLE → 400 explicite et le jeton N’EST PAS consommé (lien réutilisable)', async () => {
    politiqueMotDePasse.mockReturnValue({ ok: false, erreurs: ['Le mot de passe doit contenir au moins 12 caractères.'] });
    const res = await POST(req({ jeton: 'SECRET', motDePasse: 'court', motDePasseConfirmation: 'court' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ erreur: 'Le mot de passe doit contenir au moins 12 caractères.' });
    expect(consommerJetonReset).not.toHaveBeenCalled(); // validation AVANT consommation → lien préservé
    expect(poserMotDePasse).not.toHaveBeenCalled();
  });

  it('confirmation divergente → 400 explicite, jeton NON consommé', async () => {
    const res = await POST(req({ jeton: 'SECRET', motDePasse: BON, motDePasseConfirmation: 'autreChose12' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ erreur: MSG_CONFIRMATION_DIVERGE });
    expect(consommerJetonReset).not.toHaveBeenCalled();
    expect(poserMotDePasse).not.toHaveBeenCalled();
  });

  // ── (b) jeton rejoué → 2e consommation renvoie null → 400, aucune pose ──
  it('(b) jeton REJOUÉ → 1re fois OK, 2e fois 400 générique et AUCUNE pose (single-use)', async () => {
    consommerJetonReset.mockResolvedValueOnce('INT-42').mockResolvedValueOnce(null); // A puis épuisé
    signerSession.mockResolvedValue('JETON');

    const r1 = await POST(req({ jeton: 'SECRET', motDePasse: BON, motDePasseConfirmation: BON }));
    expect(r1.status).toBe(200);
    expect(poserMotDePasse).toHaveBeenCalledTimes(1);

    const r2 = await POST(req({ jeton: 'SECRET', motDePasse: BON, motDePasseConfirmation: BON }));
    expect(r2.status).toBe(400);
    expect(await r2.json()).toEqual({ erreur: MSG_LIEN_INVALIDE });
    expect(poserMotDePasse).toHaveBeenCalledTimes(1); // toujours 1 : le rejeu ne pose RIEN
    expect(cookieStore.set).toHaveBeenCalledTimes(1); // aucune session ouverte au rejeu
  });

  it('jeton invalide / expiré (consommation → null) → 400 générique, sans détailler la cause', async () => {
    consommerJetonReset.mockResolvedValue(null);
    const res = await POST(req({ jeton: 'PEU_IMPORTE', motDePasse: BON, motDePasseConfirmation: BON }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ erreur: MSG_LIEN_INVALIDE });
    expect(poserMotDePasse).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  // ── (c) historique intact : identité inchangée de bout en bout ──
  it('(c) HISTORIQUE INTACT : l’internaute_id est INCHANGÉ (consommation → pose → session), aucune identité recréée', async () => {
    consommerJetonReset.mockResolvedValue('INT-42'); // identité scellée dans le jeton
    signerSession.mockResolvedValue('JETON');
    await POST(req({ jeton: 'SECRET', motDePasse: BON, motDePasseConfirmation: BON }));

    // Le MÊME id circule partout : le credential est reposé pour INT-42, la session est celle d'INT-42.
    expect(poserMotDePasse).toHaveBeenCalledWith('INT-42', BON); // pose sur l'id DU JETON, jamais un id du corps
    expect(signerSession).toHaveBeenCalledWith('INT-42'); // session du MÊME internaute → son historique le suit
    // La route ne touche QUE internaute_auth (via poserMotDePasse). Aucune fonction projet/certificat n'est importée
    // ni appelable ici → l'historique (internaute_projet, certificat), rattaché à internaute.id=INT-42, est intact.
  });

  it('ORDRE : la politique est évaluée AVANT la consommation du jeton', async () => {
    consommerJetonReset.mockResolvedValue('INT-42');
    signerSession.mockResolvedValue('JETON');
    await POST(req({ jeton: 'SECRET', motDePasse: BON, motDePasseConfirmation: BON }));
    expect(politiqueMotDePasse.mock.invocationCallOrder[0]).toBeLessThan(consommerJetonReset.mock.invocationCallOrder[0]);
  });

  it('corps invalide (non-JSON) → 400, aucune consommation', async () => {
    const res = await POST(req('pas du json', true));
    expect(res.status).toBe(400);
    expect(consommerJetonReset).not.toHaveBeenCalled();
  });

  it('panne DB à la pose (jeton déjà consommé) → 500 générique, aucune session', async () => {
    consommerJetonReset.mockResolvedValue('INT-42');
    poserMotDePasse.mockRejectedValue(new Error('db down'));
    const res = await POST(req({ jeton: 'SECRET', motDePasse: BON, motDePasseConfirmation: BON }));
    expect(res.status).toBe(500);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it('ne logge JAMAIS (ni jeton, ni mot de passe)', async () => {
    const spies = ['log', 'error', 'warn', 'info'].map((m) => vi.spyOn(console, m as 'log').mockImplementation(() => {}));
    consommerJetonReset.mockResolvedValue('INT-42');
    signerSession.mockResolvedValue('JETON');
    await POST(req({ jeton: 'SECRET', motDePasse: BON, motDePasseConfirmation: BON }));
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    for (const s of spies) s.mockRestore();
  });
});
