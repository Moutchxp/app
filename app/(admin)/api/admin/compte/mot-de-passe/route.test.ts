import { describe, it, expect, vi, beforeEach } from 'vitest';

// Cookie store simulé (next/headers cookies() est async côté route).
const cookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock('next/headers', () => ({ cookies: () => Promise.resolve(cookieStore) }));

// Hachage/vérification argon2 mockés (déterministes, instantanés).
const verifier = vi.fn();
const hacher = vi.fn();
vi.mock('../../../../../lib/admin/motDePasse', () => ({
  verifier: (...a: unknown[]) => verifier(...a),
  hacher: (...a: unknown[]) => hacher(...a),
}));

// Accès DB des comptes mockés.
const trouverCompteParId = vi.fn();
const changerMotDePasseSelf = vi.fn();
vi.mock('../../../../../lib/admin/comptes', () => ({
  trouverCompteParId: (...a: unknown[]) => trouverCompteParId(...a),
  changerMotDePasseSelf: (...a: unknown[]) => changerMotDePasseSelf(...a),
  permsDuCompte: () => ({ pilotage: false, cartes_annee: false, statistiques: false, internautes: false, curation: true, banc_test: false }),
}));

import { POST } from './route';
import { signerJeton, permsToutes, permsAucune, type SessionAdmin } from '../../../../../lib/admin/session';

const SECRET = 'secret-de-test-suffisamment-long-pour-hs256-0123456789';

beforeEach(() => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  cookieStore.get.mockReset();
  cookieStore.set.mockReset();
  verifier.mockReset();
  hacher.mockReset();
  trouverCompteParId.mockReset();
  changerMotDePasseSelf.mockReset();
});

/** Pose le cookie de session (jeton réellement signé) pour `session`. */
async function connecte(session: SessionAdmin) {
  const jeton = await signerJeton(session);
  cookieStore.get.mockReturnValue({ value: jeton });
}
function requete(body: unknown): Request {
  return new Request('http://local/api/admin/compte/mot-de-passe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const compteLea = (over: Record<string, unknown> = {}) => ({
  id: 5, identifiant: 'lea@x.fr', role: 'collaborateur', actif: true, mot_de_passe: 'HASH:ancien', ...over,
});
const sessionLea = (doitChanger = true): SessionAdmin => ({ sub: 5, identifiant: 'lea@x.fr', role: 'collaborateur', perms: { ...permsAucune(), curation: true }, doitChanger });

describe('POST /api/admin/compte/mot-de-passe', () => {
  it('changement réussi → 200, drapeau abaissé (DB), jeton réémis, aucun mot de passe en clair renvoyé', async () => {
    await connecte(sessionLea());
    trouverCompteParId.mockResolvedValue(compteLea());
    verifier.mockResolvedValue(true);
    hacher.mockResolvedValue('HASH:nouveau');
    changerMotDePasseSelf.mockResolvedValue({ id: 5, identifiant: 'lea@x.fr', role: 'collaborateur', actif: true });

    const res = await POST(requete({ ancien: 'ancien-mot-de-passe', nouveau: 'nouveau-mot-de-passe-123', confirmation: 'nouveau-mot-de-passe-123' }));

    expect(res.status).toBe(200);
    const corps = await res.json();
    expect(corps).toEqual({ ok: true });
    expect(changerMotDePasseSelf).toHaveBeenCalledWith(5, 'HASH:nouveau'); // hash, jamais le clair
    expect(hacher).toHaveBeenCalledWith('nouveau-mot-de-passe-123');
    expect(cookieStore.set).toHaveBeenCalledTimes(1); // jeton frais (doitChanger=false)
    expect(JSON.stringify(corps)).not.toContain('nouveau-mot-de-passe-123'); // aucun clair dans la réponse
  });

  it('ancien mot de passe faux → 400, aucun changement', async () => {
    await connecte(sessionLea());
    trouverCompteParId.mockResolvedValue(compteLea());
    verifier.mockResolvedValue(false);
    const res = await POST(requete({ ancien: 'faux', nouveau: 'nouveau-mot-de-passe-123', confirmation: 'nouveau-mot-de-passe-123' }));
    expect(res.status).toBe(400);
    expect(changerMotDePasseSelf).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it('confirmation différente → 400', async () => {
    await connecte(sessionLea());
    trouverCompteParId.mockResolvedValue(compteLea());
    verifier.mockResolvedValue(true);
    const res = await POST(requete({ ancien: 'ancien-mot-de-passe', nouveau: 'nouveau-mot-de-passe-123', confirmation: 'autre-chose-123456' }));
    expect(res.status).toBe(400);
    expect(changerMotDePasseSelf).not.toHaveBeenCalled();
  });

  it('nouveau trop court (< 12) → 400', async () => {
    await connecte(sessionLea());
    trouverCompteParId.mockResolvedValue(compteLea());
    verifier.mockResolvedValue(true);
    const res = await POST(requete({ ancien: 'ancien-mot-de-passe', nouveau: 'court', confirmation: 'court' }));
    expect(res.status).toBe(400);
    expect(changerMotDePasseSelf).not.toHaveBeenCalled();
  });

  it('nouveau identique à l’ancien → 400', async () => {
    await connecte(sessionLea());
    trouverCompteParId.mockResolvedValue(compteLea());
    verifier.mockResolvedValue(true);
    const res = await POST(requete({ ancien: 'meme-mot-de-passe-123', nouveau: 'meme-mot-de-passe-123', confirmation: 'meme-mot-de-passe-123' }));
    expect(res.status).toBe(400);
    expect(changerMotDePasseSelf).not.toHaveBeenCalled();
  });

  it('VOIE DE SECOURS (sub=null) → refus PROPRE 400 (pas de 500), aucun accès compte', async () => {
    await connecte({ sub: null, identifiant: null, role: 'administrateur', perms: permsToutes(), doitChanger: false });
    const res = await POST(requete({ ancien: 'x', nouveau: 'nouveau-mot-de-passe-123', confirmation: 'nouveau-mot-de-passe-123' }));
    expect(res.status).toBe(400);
    expect(trouverCompteParId).not.toHaveBeenCalled();
    expect(changerMotDePasseSelf).not.toHaveBeenCalled();
  });

  it('compte DÉSACTIVÉ pendant la session → 403 ACCES_REVOQUE, aucun changement', async () => {
    await connecte(sessionLea());
    trouverCompteParId.mockResolvedValue(compteLea({ actif: false }));
    const res = await POST(requete({ ancien: 'ancien-mot-de-passe', nouveau: 'nouveau-mot-de-passe-123', confirmation: 'nouveau-mot-de-passe-123' }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ erreur: 'ACCES_REVOQUE' });
    expect(changerMotDePasseSelf).not.toHaveBeenCalled();
  });

  it('compte SUPPRIMÉ (0 ligne) → 403 ACCES_REVOQUE', async () => {
    await connecte(sessionLea());
    trouverCompteParId.mockResolvedValue(null);
    const res = await POST(requete({ ancien: 'ancien-mot-de-passe', nouveau: 'nouveau-mot-de-passe-123', confirmation: 'nouveau-mot-de-passe-123' }));
    expect(res.status).toBe(403);
    expect(changerMotDePasseSelf).not.toHaveBeenCalled();
  });

  it('non authentifié (aucun cookie) → 401', async () => {
    cookieStore.get.mockReturnValue(undefined);
    const res = await POST(requete({ ancien: 'x', nouveau: 'yyyyyyyyyyyy', confirmation: 'yyyyyyyyyyyy' }));
    expect(res.status).toBe(401);
  });
});
