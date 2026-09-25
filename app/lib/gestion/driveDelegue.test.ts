import { describe, it, expect, vi, beforeEach } from 'vitest';

const cleMock = vi.fn();
vi.mock('./compteService', async (originale) => {
  const vrai = await originale<typeof import('./compteService')>();
  return { ...vrai, lireCleService: () => cleMock() };
});

import { jetonPourSubject, oublierJetons } from './driveDelegue';
import { generateKeyPairSync } from 'node:crypto';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const CLE = {
  clientEmail: 'svav-drive@projet.iam.gserviceaccount.com',
  privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  clientId: '1234',
};

function faussefetch(reponses: Response[]) {
  const corps: string[] = [];
  let i = 0;
  const f = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
    corps.push(String(init?.body ?? ''));
    return reponses[Math.min(i++, reponses.length - 1)];
  });
  return { fetch: f as unknown as typeof fetch, corps, appels: () => f.mock.calls.length };
}
const ok = (corps: unknown): Response => new Response(JSON.stringify(corps), { status: 200 });
const ko = (corps: unknown): Response => new Response(JSON.stringify(corps), { status: 400 });

const T0 = new Date('2026-09-25T12:00:00Z');

beforeEach(() => { cleMock.mockReset(); cleMock.mockReturnValue(CLE); oublierJetons(); });

describe('obtenir un jeton au nom d’une adresse', () => {
  it('rend le jeton d’accès que Google accorde', async () => {
    const d = faussefetch([ok({ access_token: 'JETON', expires_in: 3600 })]);
    const r = await jetonPourSubject('a.jorel@sansvisavis.com', { fetch: d.fetch, maintenant: () => T0 });
    expect(r).toEqual({ ok: true, jeton: 'JETON' });
  });

  /** L'attestation part dans le corps, avec le bon type d'autorisation : c'est ce que Google attend. */
  it('envoie une attestation signée, pas un identifiant en clair', async () => {
    const d = faussefetch([ok({ access_token: 'J' })]);
    await jetonPourSubject('a@sansvisavis.com', { fetch: d.fetch, maintenant: () => T0 });
    expect(d.corps[0]).toContain('grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer');
    expect(d.corps[0]).toContain('assertion=');
    expect(d.corps[0]).not.toContain('private_key');
  });

  it('une adresse vide ou sans @ est refusée sans appeler Google', async () => {
    const d = faussefetch([ok({ access_token: 'J' })]);
    expect((await jetonPourSubject('  ', { fetch: d.fetch })).ok).toBe(false);
    expect((await jetonPourSubject('arnaud', { fetch: d.fetch })).ok).toBe(false);
    expect(d.appels()).toBe(0);
  });

  it('clé absente → « pas configuré », et aucun appel', async () => {
    cleMock.mockReturnValue(null);
    const d = faussefetch([ok({ access_token: 'J' })]);
    const r = await jetonPourSubject('a@sansvisavis.com', { fetch: d.fetch });
    expect(r).toMatchObject({ ok: false, cause: 'non_configure' });
    expect(d.appels()).toBe(0);
  });
});

describe('les refus de Google, traduits', () => {
  it('délégation non déclarée', async () => {
    const d = faussefetch([ko({ error: 'unauthorized_client' })]);
    const r = await jetonPourSubject('a@sansvisavis.com', { fetch: d.fetch, maintenant: () => T0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motif).toContain('pas encore configuré par l’administrateur');
  });

  it('compte inconnu dans l’organisation', async () => {
    const d = faussefetch([ko({ error: 'invalid_grant', error_description: 'Invalid email or User ID' })]);
    const r = await jetonPourSubject('inconnu@sansvisavis.com', { fetch: d.fetch, maintenant: () => T0 });
    if (!r.ok) expect(r.motif).toContain('n’y est pas reconnue');
  });

  it('Google injoignable → un motif, jamais une exception qui remonterait à l’écran', async () => {
    const f = vi.fn(async () => { throw new Error('réseau'); });
    const r = await jetonPourSubject('a@sansvisavis.com', { fetch: f as unknown as typeof fetch, maintenant: () => T0 });
    expect(r.ok).toBe(false);
  });
});

describe('le cache des jetons', () => {
  it('un second appel pour la MÊME adresse ne redemande rien à Google', async () => {
    const d = faussefetch([ok({ access_token: 'JETON', expires_in: 3600 })]);
    await jetonPourSubject('a@sansvisavis.com', { fetch: d.fetch, maintenant: () => T0 });
    await jetonPourSubject('a@sansvisavis.com', { fetch: d.fetch, maintenant: () => T0 });
    expect(d.appels()).toBe(1);
  });

  /** 🔴 Deux personnes ne partagent JAMAIS un jeton : ce serait leur donner les mêmes droits, tout l'inverse du lot. */
  it('une AUTRE adresse obtient son PROPRE jeton', async () => {
    const d = faussefetch([ok({ access_token: 'JETON-A', expires_in: 3600 }), ok({ access_token: 'JETON-B', expires_in: 3600 })]);
    const a = await jetonPourSubject('a@sansvisavis.com', { fetch: d.fetch, maintenant: () => T0 });
    const b = await jetonPourSubject('b@sansvisavis.com', { fetch: d.fetch, maintenant: () => T0 });
    expect(a.ok && a.jeton).toBe('JETON-A');
    expect(b.ok && b.jeton).toBe('JETON-B');
    expect(d.appels()).toBe(2);
  });

  it('un jeton expiré est redemandé', async () => {
    const d = faussefetch([ok({ access_token: 'A', expires_in: 3600 }), ok({ access_token: 'B', expires_in: 3600 })]);
    await jetonPourSubject('a@sansvisavis.com', { fetch: d.fetch, maintenant: () => T0 });
    const plusTard = new Date(T0.getTime() + 3_600_000);
    const r = await jetonPourSubject('a@sansvisavis.com', { fetch: d.fetch, maintenant: () => plusTard });
    expect(r.ok && r.jeton).toBe('B');
  });

  /**
   * 🔴 ON NE MÉMORISE PAS UN REFUS. Une délégation qu'Arno vient d'activer doit marcher au clic suivant, pas dans
   * une heure — et un compte réactivé de même.
   */
  it('un refus n’est pas mémorisé : le clic suivant redemande', async () => {
    const d = faussefetch([ko({ error: 'unauthorized_client' }), ok({ access_token: 'JETON', expires_in: 3600 })]);
    const premier = await jetonPourSubject('a@sansvisavis.com', { fetch: d.fetch, maintenant: () => T0 });
    const second = await jetonPourSubject('a@sansvisavis.com', { fetch: d.fetch, maintenant: () => T0 });
    expect(premier.ok).toBe(false);
    expect(second.ok && second.jeton).toBe('JETON');
    expect(d.appels()).toBe(2);
  });

  it('la casse de l’adresse ne crée pas deux entrées de cache', async () => {
    const d = faussefetch([ok({ access_token: 'JETON', expires_in: 3600 })]);
    await jetonPourSubject('A.Jorel@SansVisAVis.com', { fetch: d.fetch, maintenant: () => T0 });
    await jetonPourSubject('a.jorel@sansvisavis.com', { fetch: d.fetch, maintenant: () => T0 });
    expect(d.appels()).toBe(1);
  });
});
