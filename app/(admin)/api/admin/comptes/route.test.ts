import { describe, it, expect, vi, beforeEach } from 'vitest';

// Pool pg mocké : garde (exigerAdministrateur) ET comptes partagent le même module client.
const queryMock = vi.fn();
vi.mock('../../../../lib/db/client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));
// Hachage déterministe (pas d'argon2 réel).
vi.mock('../../../../lib/admin/motDePasse', () => ({ hacher: (c: string) => Promise.resolve(`HASH:${c}`) }));
// Mot de passe temporaire figé pour l'assertion exacte.
vi.mock('../../../../lib/admin/motDePasseTemporaire', () => ({ genererMotDePasseTemporaire: () => 'TEMP-FIXE-123456' }));

import { POST, GET } from './route';
import { signerJeton, permsToutes, NOM_COOKIE, type SessionAdmin } from '../../../../lib/admin/session';

const SECRET = 'secret-de-test-suffisamment-long-pour-hs256-0123456789';

beforeEach(() => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  queryMock.mockReset();
});

async function requete(session: SessionAdmin, body?: unknown): Promise<Request> {
  const jeton = await signerJeton(session);
  return new Request('http://local/api/admin/comptes', {
    method: body === undefined ? 'GET' : 'POST',
    headers: { cookie: `${NOM_COOKIE}=${jeton}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const admin = (): SessionAdmin => ({ sub: 1, identifiant: 'chef@x.fr', role: 'administrateur', perms: permsToutes(), doitChanger: false });
const collab = (): SessionAdmin => ({ sub: 3, identifiant: 'lea@x.fr', role: 'collaborateur', perms: permsToutes(), doitChanger: false });

const corpsCreation = { prenom: 'Léa', nom: 'M', identifiant: 'lea@x.fr', role: 'collaborateur', perms: { ...permsToutes(), pilotage: false } };

describe('POST /api/admin/comptes — double barrière + mot de passe temporaire', () => {
  it('administrateur : 201, mot de passe temporaire renvoyé UNE fois, jamais en clair dans le journal', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ actif: true, role: 'administrateur' }] }) // garde: rôle EN BASE
      .mockResolvedValueOnce({ rows: [] }) // trouverCompte absent
      .mockResolvedValueOnce({ rows: [{ id: 10, identifiant: 'lea@x.fr', role: 'collaborateur', actif: true }] }); // INSERT
    const res = await POST(await requete(admin(), corpsCreation));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.motDePasseTemporaire).toBe('TEMP-FIXE-123456');
    // Le CLAIR n'est JAMAIS un paramètre SQL (donc jamais stocké/journalisé) — seul le HASH l'est.
    // (Le mock `hacher` renvoie `HASH:<clair>` ; en prod argon2 ne contient pas le clair. On teste donc au
    //  niveau paramètre EXACT : aucun param n'égale le clair, un param égale le hash.)
    const params = queryMock.mock.calls.flatMap((c) => (c[1] as unknown[]) ?? []);
    expect(params).not.toContain('TEMP-FIXE-123456');
    expect(params).toContain('HASH:TEMP-FIXE-123456');
  });

  it('DOUBLE BARRIÈRE : jeton role=administrateur mais rôle RÉTROGRADÉ en base → 403, aucune création', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ actif: true, role: 'collaborateur' }] }); // garde lit le rôle RÉEL
    const jetonAdminPerime: SessionAdmin = { sub: 5, identifiant: 'ex@x.fr', role: 'administrateur', perms: permsToutes(), doitChanger: false };
    const res = await POST(await requete(jetonAdminPerime, corpsCreation));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ erreur: 'INTERDIT' });
    expect(queryMock).toHaveBeenCalledTimes(1); // garde seulement, aucun INSERT
  });

  it('collaborateur (rôle collaborateur en base) → 403', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ actif: true, role: 'collaborateur' }] });
    const res = await POST(await requete(collab(), corpsCreation));
    expect(res.status).toBe(403);
  });

  it('identifiant invalide → 422, aucune création', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ actif: true, role: 'administrateur' }] });
    const res = await POST(await requete(admin(), { ...corpsCreation, identifiant: 'pas-un-email' }));
    expect(res.status).toBe(422);
    expect(queryMock).toHaveBeenCalledTimes(1); // garde seulement
  });
});

describe('GET /api/admin/comptes', () => {
  it('administrateur : liste SANS le hash', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ actif: true, role: 'administrateur' }] }) // garde
      .mockResolvedValueOnce({ rows: [{
        id: 1, identifiant: 'a@x.fr', prenom: 'A', nom: 'B', mot_de_passe: 'HASH:zzz', role: 'collaborateur',
        actif: true, perm_pilotage: false, perm_cartes_annee: false, perm_statistiques: false,
        perm_internautes: false, perm_curation: true, perm_banc_test: false, doit_changer_mot_de_passe: false,
        derniere_connexion_a: null, cree_a: '2026-01-01',
      }] });
    const res = await GET(await requete(admin()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.comptes[0]).not.toHaveProperty('mot_de_passe');
    expect(body.comptes[0]).toMatchObject({ id: 1, identifiant: 'a@x.fr', prenom: 'A', nom: 'B' });
  });

  it('collaborateur → 403', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ actif: true, role: 'collaborateur' }] });
    const res = await GET(await requete(collab()));
    expect(res.status).toBe(403);
  });
});
