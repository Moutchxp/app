import { describe, it, expect, vi, beforeEach } from 'vitest';

// Cookie store simulé (next/headers cookies() est async côté route).
const cookieStore = { set: vi.fn(), delete: vi.fn() };
vi.mock('next/headers', () => ({ cookies: () => Promise.resolve(cookieStore) }));

// Vérification argon2 (`verifier`) — mockée : pilote À LA FOIS la voie NOMMÉE et la voie de SECOURS (qui compare
// désormais le secret partagé au hash décodé de `ADMIN_PASSWORD_ARGON2_B64`, plus AUCUNE comparaison SHA-256). Pas
// de hachage réel ici. (`password.ts` n'est plus importé par la route → aucun mock à poser dessus.)
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

// Anti-force-brute (Lot 7) — mocké : isole la route du pool analytique (pool.ts throw sans DATABASE_URL) et
// permet de piloter le throttle. verifierThrottle laisse passer par défaut (voir beforeEach).
const verifierThrottle = vi.fn();
const noterEchec = vi.fn();
const noterSucces = vi.fn();
vi.mock('../../../../lib/auth/antiBruteforce', () => ({
  verifierThrottle: (...a: unknown[]) => verifierThrottle(...a),
  noterEchec: (...a: unknown[]) => noterEchec(...a),
  noterSucces: (...a: unknown[]) => noterSucces(...a),
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
  delete process.env.ADMIN_PASSWORD_ARGON2; // ancienne var (non-b64) obsolète — la route ne la lit plus
  // Hash break-glass présent par défaut, ENCODÉ base64 (comme en .env) ; la route le DÉCODE → 'HASH_SECOURS_TEST'.
  process.env.ADMIN_PASSWORD_ARGON2_B64 = Buffer.from('HASH_SECOURS_TEST', 'utf8').toString('base64');
  cookieStore.set.mockReset();
  verifier.mockReset();
  trouverCompte.mockReset();
  marquerConnexion.mockReset();
  verifierThrottle.mockReset();
  noterEchec.mockReset();
  noterSucces.mockReset();
  verifierThrottle.mockResolvedValue({ bloque: false, retryAfter: 0 }); // throttle laisse passer par défaut
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

  it('(c) voie de secours (identifiant vide + secret partagé argon2) réussit → 200', async () => {
    verifier.mockResolvedValue(true); // le secret matche le hash décodé de ADMIN_PASSWORD_ARGON2_B64
    const res = await POST(requete({ identifiant: '', password: 'partage' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    // Le B64 en env est DÉCODÉ par hashBreakGlass() → 'HASH_SECOURS_TEST' : prouve le round-trip base64 (plus de SHA-256).
    expect(verifier).toHaveBeenCalledWith('partage', 'HASH_SECOURS_TEST');
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

  it('voie de secours avec mauvais secret → 401 identique', async () => {
    verifier.mockResolvedValue(false);
    const res = await POST(requete({ identifiant: '', password: 'faux' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ erreur: 'Identifiants invalides' });
  });

  it('FAIL-CLOSED + TEMPS CONSTANT : ADMIN_PASSWORD_ARGON2_B64 absent → verifier(password, LEURRE) → 401 (aucun throw)', async () => {
    delete process.env.ADMIN_PASSWORD_ARGON2_B64;
    verifier.mockResolvedValue(false); // le leurre ne matche jamais le mot de passe → false
    const res = await POST(requete({ identifiant: '', password: 'partage' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ erreur: 'Identifiants invalides' }); // MÊME message : ne révèle pas la var manquante
    // hashBreakGlass() renvoie HASH_LEURRE (un argon2id), PAS '' : `verifier` exécute un argon2 COMPLET (temps
    // constant) → « break-glass non armé » indiscernable de « mauvais secret » par le timing (anti-énumération).
    expect(verifier).toHaveBeenCalledWith('partage', expect.stringMatching(/^\$argon2id\$/));
  });

  it('FAIL-CLOSED + TEMPS CONSTANT : _B64 se décodant en chaîne VIDE → repli LEURRE (pas de chemin rapide) → 401', async () => {
    process.env.ADMIN_PASSWORD_ARGON2_B64 = '   '; // que des caractères hors-alphabet base64 → décodage '' → leurre
    verifier.mockResolvedValue(false);
    const res = await POST(requete({ identifiant: '', password: 'partage' }));
    expect(res.status).toBe(401);
    expect(verifier).toHaveBeenCalledWith('partage', expect.stringMatching(/^\$argon2id\$/)); // leurre, temps constant
  });

  it('FAIL-CLOSED : _B64 NON vide mais corrompu → valeur décodée passée telle quelle → 401 propre (aucun throw)', async () => {
    process.env.ADMIN_PASSWORD_ARGON2_B64 = '@@@ pas du base64 valide @@@'; // décode en octets NON vides → passés à verifier
    verifier.mockResolvedValue(false); // argon2 rejette la valeur décodée (qui n'est pas un hash valide)
    const res = await POST(requete({ identifiant: '', password: 'partage' }));
    expect(res.status).toBe(401); // pas de 500 : le décodage ne crashe jamais la route
    expect(await res.json()).toEqual({ erreur: 'Identifiants invalides' });
    expect(verifier).toHaveBeenCalledTimes(1); // verifier appelé une fois (valeur décodée), pas court-circuité
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

describe('POST /api/admin/session — anti-force-brute (Lot 7)', () => {
  it('throttlé → 429 + Retry-After ; AUCUNE vérification de mot de passe (password.ts non appelé)', async () => {
    verifierThrottle.mockResolvedValue({ bloque: true, retryAfter: 42 });
    const res = await POST(requete({ identifiant: 'arno@x.com', password: 'peu importe' }));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('42');
    expect(verifier).not.toHaveBeenCalled(); // pas d'appel à `verifier` (argon2) quand throttlé
    expect(trouverCompte).not.toHaveBeenCalled(); // anti-énumération : throttle AVANT toute résolution de compte
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it('anti-énumération : throttle keyé sur la CHAÎNE, appliqué même pour un compte inexistant (429 sans DB)', async () => {
    verifierThrottle.mockResolvedValue({ bloque: true, retryAfter: 5 });
    const res = await POST(requete({ identifiant: 'fantome@x.com', password: 'x' }));
    expect(res.status).toBe(429);
    expect(trouverCompte).not.toHaveBeenCalled(); // aucune fuite d'existence
  });

  it('échec → noterEchec(identifiant NORMALISÉ minuscules), jamais noterSucces', async () => {
    trouverCompte.mockResolvedValue(compte());
    verifier.mockResolvedValue(false);
    await POST(requete({ identifiant: 'Arno@X.com', password: 'faux' }));
    expect(noterEchec).toHaveBeenCalledWith('arno@x.com'); // clé throttle normalisée (anti-bypass par casse)
    expect(noterSucces).not.toHaveBeenCalled();
  });

  it('échec voie de secours → noterEchec(\'\') (chaîne vide = secours), jamais noterSucces', async () => {
    verifier.mockResolvedValue(false);
    await POST(requete({ identifiant: '', password: 'faux' }));
    expect(noterEchec).toHaveBeenCalledWith('');
    expect(noterSucces).not.toHaveBeenCalled();
  });

  it('succès → noterSucces (reset du throttle de cet identifiant), jamais noterEchec', async () => {
    trouverCompte.mockResolvedValue(compte());
    verifier.mockResolvedValue(true);
    await POST(requete({ identifiant: 'arno@x.com', password: 'bon' }));
    expect(noterSucces).toHaveBeenCalledWith('arno@x.com');
    expect(noterEchec).not.toHaveBeenCalled();
  });

  it('BREAK-GLASS (F1) : la voie de secours (identifiant vide) n’est JAMAIS throttlée', async () => {
    verifierThrottle.mockResolvedValue({ bloque: true, retryAfter: 999 }); // même si le throttle voudrait bloquer…
    verifier.mockResolvedValue(true);
    const res = await POST(requete({ identifiant: '', password: 'partage' }));
    expect(res.status).toBe(200); // …le secours passe : corde de rappel toujours disponible
    expect(verifierThrottle).not.toHaveBeenCalled(); // '' n’est jamais soumis au throttle (pas de DoS-lockout système)
  });
});
