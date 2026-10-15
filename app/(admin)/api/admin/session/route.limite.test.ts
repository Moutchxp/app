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
  };
});

import { POST } from './route';

function req(body: unknown): Request {
  return new Request('http://localhost/api/admin/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
