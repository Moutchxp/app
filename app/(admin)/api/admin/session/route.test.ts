import { describe, it, expect, vi, beforeEach } from 'vitest';

// Cookie store simulé (next/headers cookies() est async côté route).
const cookieStore = { set: vi.fn(), delete: vi.fn() };
vi.mock('next/headers', () => ({ cookies: () => Promise.resolve(cookieStore) }));

// Voie de secours (mot de passe partagé) — mockée pour piloter le verdict sans dépendre de ADMIN_PASSWORD.
const motDePasseValide = vi.fn();
vi.mock('../../../../lib/admin/password', () => ({ motDePasseValide: (...a: unknown[]) => motDePasseValide(...a) }));

// Vérification argon2 — mockée (pas de hachage réel dans ce test de route).
const verifier = vi.fn();
vi.mock('../../../../lib/admin/motDePasse', () => ({ verifier: (...a: unknown[]) => verifier(...a) }));

// Accès DB des comptes — mockés.
const trouverCompte = vi.fn();
const marquerConnexion = vi.fn();
vi.mock('../../../../lib/admin/comptes', () => ({
  trouverCompte: (...a: unknown[]) => trouverCompte(...a),
  marquerConnexion: (...a: unknown[]) => marquerConnexion(...a),
  permsDuCompte: () => ({ pilotage: true, cartes_annee: true, statistiques: true, internautes: true, curation: true, banc_test: true }),
}));

import { POST } from './route';

function requete(body: unknown): Request {
  return new Request('http://local/api/admin/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function compte(over: Record<string, unknown> = {}) {
  return { id: 5, identifiant: 'arno', role: 'administrateur', actif: true, mot_de_passe: 'HASH:x', ...over };
}

beforeEach(() => {
  process.env.ADMIN_SESSION_SECRET = 'secret-de-test-suffisamment-long-pour-hs256-0123456789';
  cookieStore.set.mockReset();
  motDePasseValide.mockReset();
  verifier.mockReset();
  trouverCompte.mockReset();
  marquerConnexion.mockReset();
});

describe('POST /api/admin/session', () => {
  it('(a) connexion par compte réussit → 200, cookie posé, derniere_connexion_a mise à jour', async () => {
    trouverCompte.mockResolvedValue(compte());
    verifier.mockResolvedValue(true);
    const res = await POST(requete({ identifiant: 'arno', password: 'bon' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(marquerConnexion).toHaveBeenCalledWith(5);
    expect(cookieStore.set).toHaveBeenCalledTimes(1);
  });

  it('(b) compte désactivé refusé → 401 générique, aucune connexion marquée', async () => {
    trouverCompte.mockResolvedValue(compte({ actif: false }));
    verifier.mockResolvedValue(true); // même mot de passe correct : le refus vient de actif=false
    const res = await POST(requete({ identifiant: 'arno', password: 'bon' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ erreur: 'Identifiants invalides' });
    expect(marquerConnexion).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it('(c) voie de secours (identifiant vide + ancien mot de passe partagé) réussit → 200', async () => {
    motDePasseValide.mockReturnValue(true);
    const res = await POST(requete({ identifiant: '', password: 'partage' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(trouverCompte).not.toHaveBeenCalled(); // voie de secours : aucun accès DB compte
    expect(cookieStore.set).toHaveBeenCalledTimes(1);
  });

  it('mauvais mot de passe → 401 générique identique', async () => {
    trouverCompte.mockResolvedValue(compte());
    verifier.mockResolvedValue(false);
    const res = await POST(requete({ identifiant: 'arno', password: 'faux' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ erreur: 'Identifiants invalides' });
  });

  it('identifiant inconnu → verify de leurre exécuté (temps constant) + 401 identique', async () => {
    trouverCompte.mockResolvedValue(null);
    verifier.mockResolvedValue(false);
    const res = await POST(requete({ identifiant: 'fantome', password: 'peu importe' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ erreur: 'Identifiants invalides' });
    expect(verifier).toHaveBeenCalledTimes(1); // leurre : pas de court-circuit qui révélerait l'absence
  });

  it('voie de secours avec mauvais mot de passe partagé → 401 identique', async () => {
    motDePasseValide.mockReturnValue(false);
    const res = await POST(requete({ identifiant: '', password: 'faux' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ erreur: 'Identifiants invalides' });
  });

  it('(f) identifiant MAL FORMÉ (pas une adresse e-mail) → 401 générique identique, jamais un motif e-mail', async () => {
    trouverCompte.mockResolvedValue(null); // aucun compte ne peut matcher (CHECK e-mail en base)
    verifier.mockResolvedValue(false);
    const res = await POST(requete({ identifiant: 'pas-un-email', password: 'x' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ erreur: 'Identifiants invalides' });
    expect(verifier).toHaveBeenCalledTimes(1); // leurre exécuté → même timing, aucun court-circuit révélateur
  });

  it('(d) connexion insensible à la casse : identifiant en MAJUSCULES accepté, délégué à trouverCompte', async () => {
    trouverCompte.mockResolvedValue(compte({ identifiant: 'a.jorel@sansvisavis.com' }));
    verifier.mockResolvedValue(true);
    const res = await POST(requete({ identifiant: 'A.Jorel@SansVisAVis.COM', password: 'bon' }));
    expect(res.status).toBe(200);
    // La casse est résolue par trouverCompte (SQL lower()=lower()) : la route transmet la saisie telle quelle.
    expect(trouverCompte).toHaveBeenCalledWith('A.Jorel@SansVisAVis.COM');
  });
});
