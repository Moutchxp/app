import { describe, it, expect, vi, beforeEach } from 'vitest';

// Cookie store simulé (next/headers cookies() est async côté route).
const cookieStore = { set: vi.fn(), delete: vi.fn(), get: vi.fn() };

// Points 4-5 (15/10/2026) — état de session en base, simulé : version de session 7 ; révocation observée.
const lireEtatCompte = vi.fn();
const revoquerSessions = vi.fn();
vi.mock('../../../../lib/admin/etatSession', async () => {
  const vrai = await vi.importActual<typeof import('../../../../lib/admin/etatSession')>('../../../../lib/admin/etatSession');
  return { ...vrai, lireEtatCompte: (...a: unknown[]) => lireEtatCompte(...a), revoquerSessions: (...a: unknown[]) => revoquerSessions(...a) };
});
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
  permsDuCompte: () => ({ pilotage: true, cartes_annee: true, statistiques: true, internautes: true, curation: true, banc_test: true, permis: true }),
  capaciteModifPermis: () => true, // RATT-EDIT lot A3 — capacité de modif (mock)
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
  // Point 3 (limite par IP) : aucune adresse établie dans ces tests → pas de limite par IP (scénarios dans route.limite.test.ts).
  cleThrottleIp: () => null,
  verifierThrottleIp: vi.fn(async () => ({ bloque: false, retryAfter: 0 })),
  noterEchecIp: vi.fn(async () => undefined),
}));

// Point 8 (15/10/2026) — journal des connexions, simulé (observé).
const journaliserConnexion = vi.fn();
const purgerJournalConnexions = vi.fn();
vi.mock('../../../../lib/auth/journalConnexion', () => ({
  journaliserConnexion: (...a: unknown[]) => journaliserConnexion(...a),
  purgerJournalConnexions: (...a: unknown[]) => purgerJournalConnexions(...a),
}));

import { POST, DELETE } from './route';
import { verifierJeton, signerJeton, permsToutes } from '../../../../lib/admin/session';
import { empreinteMotDePasse } from '../../../../lib/admin/etatSession';

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
  cookieStore.get.mockReset();
  cookieStore.delete.mockReset();
  lireEtatCompte.mockReset().mockResolvedValue({ versionSession: 7 });
  revoquerSessions.mockReset().mockResolvedValue(true);
  journaliserConnexion.mockReset().mockResolvedValue(undefined);
  purgerJournalConnexions.mockReset().mockResolvedValue(undefined);
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

  // Décision d'Arno du 15/10/2026 (audit, point A) : la VOIE DE SECOURS est RETIRÉE de la route web. Ce test affirmait
  // l'inverse (« identifiant vide + secret partagé → 200 ») ; le secours ne passe plus que par `npm run admin:secours`.
  it('(c) VOIE DE SECOURS RETIRÉE : identifiant vide + BON secret partagé → 401 générique, aucun cookie, aucune vérification', async () => {
    verifier.mockResolvedValue(true); // même si le secret « matchait » : il n'est plus jamais comparé
    const res = await POST(requete({ identifiant: '', password: 'partage' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ erreur: 'Identifiants invalides' });
    expect(verifier).not.toHaveBeenCalled();
    expect(trouverCompte).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
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

  it('identifiant vide avec un mauvais secret → 401 identique (voie retirée : même réponse que tout échec)', async () => {
    verifier.mockResolvedValue(false);
    const res = await POST(requete({ identifiant: '', password: 'faux' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ erreur: 'Identifiants invalides' });
    expect(verifier).not.toHaveBeenCalled();
  });

  // Les trois cas suivants éprouvaient le décodage de ADMIN_PASSWORD_ARGON2_B64 (absent, vide, corrompu). Voie retirée : quelle
  // que soit la variable, un identifiant vide est refusé pareil, sans la lire ni rien vérifier — elle peut rester dans le .env.
  it('voie retirée : ADMIN_PASSWORD_ARGON2_B64 ABSENT → 401 identique, aucune vérification (aucun throw)', async () => {
    delete process.env.ADMIN_PASSWORD_ARGON2_B64;
    const res = await POST(requete({ identifiant: '', password: 'partage' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ erreur: 'Identifiants invalides' });
    expect(verifier).not.toHaveBeenCalled();
  });

  it('voie retirée : ADMIN_PASSWORD_ARGON2_B64 se décodant en chaîne VIDE → 401 identique, aucune vérification', async () => {
    process.env.ADMIN_PASSWORD_ARGON2_B64 = '   ';
    const res = await POST(requete({ identifiant: '', password: 'partage' }));
    expect(res.status).toBe(401);
    expect(verifier).not.toHaveBeenCalled();
  });

  it('voie retirée : ADMIN_PASSWORD_ARGON2_B64 corrompu → 401 propre (aucun throw), aucune vérification', async () => {
    process.env.ADMIN_PASSWORD_ARGON2_B64 = '@@@ pas du base64 valide @@@';
    const res = await POST(requete({ identifiant: '', password: 'partage' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ erreur: 'Identifiants invalides' });
    expect(verifier).not.toHaveBeenCalled();
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

  it('identifiant vide → compté comme un échec (noterEchec(\'\')), jamais noterSucces — la tentative reste visible à l\'audit', async () => {
    verifier.mockResolvedValue(true);
    await POST(requete({ identifiant: '', password: 'partage' }));
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

  // Lot SÉCURITÉ DE L'ADMIN EXPOSÉE (15/10/2026), trou CRITIQUE n° 1 : ce test affirmait l'inverse (« la voie de secours
  // n'est JAMAIS throttlée », revue Lot 7 F1) — essais illimités depuis internet sur le secret partagé. Scénario complet
  // avec un état de throttle réel en mémoire : route.limite.test.ts.
  it('identifiant vide (ancienne voie de secours) throttlé comme les comptes nommés, sous la clé \'\' → 429 sans vérifier le secret', async () => {
    verifierThrottle.mockResolvedValue({ bloque: true, retryAfter: 999 });
    verifier.mockResolvedValue(true);
    const res = await POST(requete({ identifiant: '', password: 'partage' }));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('999');
    expect(verifierThrottle).toHaveBeenCalledWith('');
    expect(verifier).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
});

// ══ AUDIT POINT 4 (15/10/2026) — le jeton porte de quoi être révoqué ; la déconnexion révoque côté serveur ══════════════
describe('session révocable (point 4)', () => {
  it('connexion : le jeton porte l’empreinte du mot de passe (emp) et la version de session du compte (ver)', async () => {
    trouverCompte.mockResolvedValue(compte({ mot_de_passe: 'HASH:arno' }));
    verifier.mockResolvedValue(true);
    await POST(requete({ identifiant: 'arno@x.com', password: 'bon' }));
    const jeton = cookieStore.set.mock.calls[0][1] as string;
    const payload = await verifierJeton(jeton);
    expect(payload?.emp).toBe(empreinteMotDePasse('HASH:arno'));
    expect(payload?.emp).not.toContain('HASH'); // une empreinte, pas le hash
    expect(payload?.ver).toBe(7);
  });

  it('connexion, migration 356 non appliquée (version null) : pas de claim ver, la connexion marche', async () => {
    lireEtatCompte.mockResolvedValue({ versionSession: null });
    trouverCompte.mockResolvedValue(compte());
    verifier.mockResolvedValue(true);
    const res = await POST(requete({ identifiant: 'arno@x.com', password: 'bon' }));
    expect(res.status).toBe(200);
    expect((await verifierJeton(cookieStore.set.mock.calls[0][1] as string))?.ver).toBeUndefined();
  });

  it('DÉCONNEXION : toutes les sessions du compte sont révoquées en base (avant : seul le cookie était effacé)', async () => {
    const jeton = await signerJeton({ sub: 5, identifiant: 'arno', role: 'administrateur', perms: permsToutes(), doitChanger: false, peutModifierPermis: true });
    cookieStore.get.mockReturnValue({ value: jeton });
    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(revoquerSessions).toHaveBeenCalledWith(5);
    expect(cookieStore.delete).toHaveBeenCalledWith({ name: 'svv_admin_session', path: '/' });
  });

  it('déconnexion sans cookie, ou révocation impossible : le cookie est effacé quand même, jamais d’erreur', async () => {
    cookieStore.get.mockReturnValue(undefined);
    expect((await DELETE()).status).toBe(200);
    expect(revoquerSessions).not.toHaveBeenCalled();
    expect(cookieStore.delete).toHaveBeenCalledTimes(1);
  });
});

// ══ AUDIT POINT 8 (15/10/2026) — chaque tentative laisse une trace : qui, quand, résultat (l'adresse en empreinte) ═════════
// Le trou : seuls des compteurs anonymes existaient ; une intrusion ne laissait aucune trace exploitable.
describe('journal des connexions (point 8)', () => {
  it('connexion RÉUSSIE → une ligne « succes » avec l’identifiant et le compte, puis purge au-delà de la conservation', async () => {
    trouverCompte.mockResolvedValue(compte());
    verifier.mockResolvedValue(true);
    await POST(requete({ identifiant: 'Arno@X.com', password: 'bon' }));
    expect(journaliserConnexion).toHaveBeenCalledWith({ identifiant: 'arno@x.com', compteId: 5, resultat: 'succes', ipEmpreinte: null });
    expect(purgerJournalConnexions).toHaveBeenCalledTimes(1);
  });

  it('mauvais mot de passe sur un compte existant → « echec » avec le compte ; compte inconnu → « echec » sans compte', async () => {
    trouverCompte.mockResolvedValue(compte());
    verifier.mockResolvedValue(false);
    await POST(requete({ identifiant: 'arno@x.com', password: 'faux' }));
    expect(journaliserConnexion).toHaveBeenLastCalledWith({ identifiant: 'arno@x.com', compteId: 5, resultat: 'echec', ipEmpreinte: null });
    trouverCompte.mockResolvedValue(null);
    await POST(requete({ identifiant: 'fantome@x.com', password: 'x' }));
    expect(journaliserConnexion).toHaveBeenLastCalledWith({ identifiant: 'fantome@x.com', compteId: null, resultat: 'echec', ipEmpreinte: null });
  });

  it('tentative BLOQUÉE par la limite → « bloque » ; identifiant vide (ancienne voie de secours) → « echec »', async () => {
    verifierThrottle.mockResolvedValue({ bloque: true, retryAfter: 30 });
    await POST(requete({ identifiant: 'arno@x.com', password: 'x' }));
    expect(journaliserConnexion).toHaveBeenLastCalledWith({ identifiant: 'arno@x.com', compteId: null, resultat: 'bloque', ipEmpreinte: null });
    verifierThrottle.mockResolvedValue({ bloque: false, retryAfter: 0 });
    await POST(requete({ identifiant: '', password: 'partage' }));
    expect(journaliserConnexion).toHaveBeenLastCalledWith({ identifiant: '', compteId: null, resultat: 'echec', ipEmpreinte: null });
  });

  it('le mot de passe n’est jamais journalisé', async () => {
    trouverCompte.mockResolvedValue(compte());
    verifier.mockResolvedValue(false);
    await POST(requete({ identifiant: 'arno@x.com', password: 'mot-de-passe-secret' }));
    expect(JSON.stringify(journaliserConnexion.mock.calls)).not.toContain('mot-de-passe-secret');
  });
});
