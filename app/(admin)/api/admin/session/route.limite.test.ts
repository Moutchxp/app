import { describe, it, expect, beforeEach, vi } from 'vitest';

// LOT « SÉCURITÉ DE L'ADMIN EXPOSÉE — CORRECTIFS CRITIQUES » : la route de connexion de l'admin, avec un état de throttle
// EN MÉMOIRE (même règle que la vraie : `delaiPour`, seuil 5 échecs). argon2, base et cookie sont simulés : on teste la
// LOGIQUE de la route — aucune base, aucun réseau.
const { verifier, trouverCompte, marquerConnexion } = vi.hoisted(() => ({
  verifier: vi.fn(),
  trouverCompte: vi.fn(),
  marquerConnexion: vi.fn(),
}));
const echecs = vi.hoisted(() => new Map<string, number[]>());
const cookieStore = { set: vi.fn(), delete: vi.fn() };

vi.mock('server-only', () => ({}));
vi.mock('../../../../lib/analytics/pool', () => ({ queryAnalytics: vi.fn(async () => { throw new Error('aucune base dans ce test'); }) }));
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => cookieStore) }));
vi.mock('../../../../lib/admin/motDePasse', () => ({ verifier }));
vi.mock('../../../../lib/admin/comptes', () => ({
  trouverCompte,
  marquerConnexion,
  permsDuCompte: () => ({}),
  capaciteModifPermis: () => false,
}));
vi.mock('../../../../lib/admin/session', () => ({
  NOM_COOKIE: 'svv_admin_session',
  optionsCookie: () => ({}),
  signerJeton: vi.fn(async () => 'jeton'),
  permsToutes: () => ({}),
  verifierJeton: vi.fn(async () => null),
  sessionDepuisPayload: vi.fn(),
}));
vi.mock('../../../../lib/auth/journalConnexion', () => ({ journaliserConnexion: vi.fn(async () => undefined), purgerJournalConnexions: vi.fn(async () => undefined) }));
vi.mock('../../../../lib/admin/etatSession', () => ({
  empreinteMotDePasse: () => 'empreinte',
  lireEtatCompte: vi.fn(async () => ({ versionSession: null })),
  revoquerSessions: vi.fn(async () => false),
}));
vi.mock('../../../../lib/auth/antiBruteforce', async () => {
  const vrai = await vi.importActual<typeof import('../../../../lib/auth/antiBruteforce')>('../../../../lib/auth/antiBruteforce');
  const cfg = { seuil: 5, baseS: 2, maxS: 300 };
  return {
    verifierThrottle: vi.fn(async (cle: string) => {
      const ts = echecs.get(cle) ?? [];
      const requis = vrai.delaiPour(ts.length, cfg);
      if (requis === 0) return { bloque: false, retryAfter: 0 };
      const ecouleS = (Date.now() - ts[ts.length - 1]) / 1000;
      return ecouleS >= requis ? { bloque: false, retryAfter: 0 } : { bloque: true, retryAfter: Math.ceil(requis - ecouleS) };
    }),
    noterEchec: vi.fn(async (cle: string) => { echecs.set(cle, [...(echecs.get(cle) ?? []), Date.now()]); }),
    noterSucces: vi.fn(async (cle: string) => { echecs.delete(cle); }),
    // Point 3 (limite par IP) : la VRAIE dérivation de la clé (empreinte HMAC), et un état en mémoire au seuil par défaut (20).
    cleThrottleIp: (requete: Request) => vrai.cleThrottleIp(requete),
    verifierThrottleIp: vi.fn(async (cle: string) => {
      const ts = echecs.get(cle) ?? [];
      const requis = vrai.delaiPour(ts.length, { ...cfg, seuil: 20 });
      if (requis === 0) return { bloque: false, retryAfter: 0 };
      const ecouleS = (Date.now() - ts[ts.length - 1]) / 1000;
      return ecouleS >= requis ? { bloque: false, retryAfter: 0 } : { bloque: true, retryAfter: Math.ceil(requis - ecouleS) };
    }),
    noterEchecIp: vi.fn(async (cle: string) => { echecs.set(cle, [...(echecs.get(cle) ?? []), Date.now()]); }),
  };
});

import { POST } from './route';

function req(body: unknown, ip?: string): Request {
  return new Request('http://localhost/api/admin/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(ip ? { 'X-Forwarded-For': ip } : {}) },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/session — limite des essais', () => {
  beforeEach(() => {
    echecs.clear();
    verifier.mockReset().mockResolvedValue(false);
    trouverCompte.mockReset().mockResolvedValue(null);
    marquerConnexion.mockReset();
    cookieStore.set.mockReset();
  });

  it('voie de SECOURS (identifiant vide) : au-delà de 5 mauvais secrets, 429 sans même vérifier le secret', async () => {
    const statuts: number[] = [];
    for (let i = 0; i < 8; i++) statuts.push((await POST(req({ identifiant: '', password: `essai-${i}` }))).status);
    expect(statuts.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuts.slice(5)).toEqual([429, 429, 429]);
    expect(verifier).not.toHaveBeenCalled(); // voie retirée (15/10/2026) : le secret n'est JAMAIS éprouvé
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it('voie de secours bloquée : même le BON secret attend (pas de devinette possible pendant le blocage)', async () => {
    for (let i = 0; i < 5; i++) await POST(req({ identifiant: '', password: 'faux' }));
    verifier.mockResolvedValue(true);
    const r = await POST(req({ identifiant: '', password: 'le-bon' }));
    expect(r.status).toBe(429);
    expect(Number(r.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  // Décision d'Arno du 15/10/2026 : voie de secours RETIRÉE de la route web. Ce cas affirmait « le bon secret du premier coup
  // ouvre la session » ; il n'ouvre plus rien. Le secours passe uniquement par `npm run admin:secours` sur le serveur.
  it('voie de secours RETIRÉE : le bon secret du premier coup n\'ouvre plus aucune session (401)', async () => {
    verifier.mockResolvedValue(true);
    const r = await POST(req({ identifiant: '', password: 'le-bon' }));
    expect(r.status).toBe(401);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it('la voie de secours bloquée ne bloque PAS un compte nommé (fondateur inchangé)', async () => {
    for (let i = 0; i < 6; i++) await POST(req({ identifiant: '', password: 'faux' }));
    trouverCompte.mockResolvedValue({ id: 1, identifiant: 'arno@exemple.fr', role: 'administrateur', actif: true, mot_de_passe: 'h', doit_changer_mot_de_passe: false });
    verifier.mockResolvedValue(true);
    const r = await POST(req({ identifiant: 'arno@exemple.fr', password: 'bon' }));
    expect(r.status).toBe(200);
    expect(marquerConnexion).toHaveBeenCalledWith(1);
  });

  it('compte nommé : même limite (comportement existant, inchangé)', async () => {
    const statuts: number[] = [];
    for (let i = 0; i < 6; i++) statuts.push((await POST(req({ identifiant: 'X@Exemple.fr', password: 'faux' }))).status);
    expect(statuts).toEqual([401, 401, 401, 401, 401, 429]);
    expect(echecs.has('x@exemple.fr')).toBe(true); // clé normalisée en minuscules
  });
});

// ══ AUDIT POINT 3 (15/10/2026) — LIMITE PAR ADRESSE IP, en plus de la limite par compte ══════════════════════════════════
// Le trou : la limite ne comptait que par IDENTIFIANT. Une seule machine pouvait essayer un mot de passe sur des dizaines de
// comptes (« pulvérisation ») sans jamais être freinée : chaque identifiant restait sous son propre seuil.
describe('POST /api/admin/session — limite par adresse IP (point 3)', () => {
  const ATTAQUANT = '203.0.113.7';
  beforeEach(() => {
    echecs.clear();
    verifier.mockReset().mockResolvedValue(false);
    trouverCompte.mockReset().mockResolvedValue(null);
    marquerConnexion.mockReset();
    cookieStore.set.mockReset();
    process.env.ADMIN_SESSION_SECRET = 'secret-de-test-suffisamment-long-pour-hs256-0123456789';
    process.env.CADENCE_ENTETE_IP = 'x-forwarded-for'; // mandataire de confiance déclaré (Caddy), comme sur le serveur
  });

  it('pulvérisation depuis UNE adresse sur 25 comptes différents : au-delà de 20 échecs, 429 — même pour un compte jamais essayé', async () => {
    const statuts: number[] = [];
    for (let i = 0; i < 25; i++) statuts.push((await POST(req({ identifiant: `cible${i}@exemple.fr`, password: 'faux' }, ATTAQUANT))).status);
    expect(statuts.slice(0, 20)).toEqual(Array(20).fill(401));
    expect(statuts.slice(20)).toEqual([429, 429, 429, 429, 429]);
    expect(verifier).toHaveBeenCalledTimes(20); // une fois l'adresse bloquée, plus aucun mot de passe n'est éprouvé
  });

  it('l’adresse n’est JAMAIS gardée en clair : la clé est une empreinte « ip: » + 64 caractères hexadécimaux', async () => {
    await POST(req({ identifiant: 'x@exemple.fr', password: 'faux' }, ATTAQUANT));
    const clesIp = [...echecs.keys()].filter((k) => k.startsWith('ip:'));
    expect(clesIp).toHaveLength(1);
    expect(clesIp[0]).toMatch(/^ip:[0-9a-f]{64}$/);
    expect([...echecs.keys()].join(' ')).not.toContain(ATTAQUANT);
  });

  it('une AUTRE adresse n’est pas bloquée : Arno se connecte pendant l’attaque (fondateur inchangé)', async () => {
    for (let i = 0; i < 25; i++) await POST(req({ identifiant: `cible${i}@exemple.fr`, password: 'faux' }, ATTAQUANT));
    trouverCompte.mockResolvedValue({ id: 1, identifiant: 'arno@exemple.fr', role: 'administrateur', actif: true, mot_de_passe: 'h', doit_changer_mot_de_passe: false });
    verifier.mockResolvedValue(true);
    const r = await POST(req({ identifiant: 'arno@exemple.fr', password: 'bon' }, '198.51.100.20'));
    expect(r.status).toBe(200);
  });

  it('adresse INCONNUE (aucun mandataire de confiance déclaré) → pas de limite par IP : jamais un compteur commun qui bloquerait tout le monde', async () => {
    delete process.env.CADENCE_ENTETE_IP;
    const statuts: number[] = [];
    for (let i = 0; i < 25; i++) statuts.push((await POST(req({ identifiant: `cible${i}@exemple.fr`, password: 'faux' }, ATTAQUANT))).status);
    expect(statuts).toEqual(Array(25).fill(401)); // la limite par COMPTE reste, elle, toujours active
    expect([...echecs.keys()].some((k) => k.startsWith('ip:'))).toBe(false);
  });

  it('en-tête de confiance absent de la requête → pas de limite par IP (on ne devine pas une adresse)', async () => {
    for (let i = 0; i < 22; i++) await POST(req({ identifiant: `cible${i}@exemple.fr`, password: 'faux' }));
    expect([...echecs.keys()].some((k) => k.startsWith('ip:'))).toBe(false);
  });
});
