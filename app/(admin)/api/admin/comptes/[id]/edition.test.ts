import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// Pool pg mocké (garde + comptes partagent le module). withTransaction route vers queryMock (desactiverCompte).
const queryMock = vi.fn();
vi.mock('../../../../../lib/db/client', () => ({
  query: (...a: unknown[]) => queryMock(...a),
  withTransaction: (fn: (q: (...a: unknown[]) => unknown) => unknown) => fn((...a: unknown[]) => queryMock(...a)),
}));

import { POST as postRole } from './role/route';
import { POST as postPerms } from './permissions/route';
import { POST as postActif } from './actif/route';
import { signerJeton, permsToutes, NOM_COOKIE, type SessionAdmin } from '../../../../../lib/admin/session';

const SECRET = 'secret-de-test-suffisamment-long-pour-hs256-0123456789';
const ctx = { params: Promise.resolve({ id: '5' }) };

// LOT 5-DROITS — voir route.test.ts : on préchauffe la sonde de schéma pour qu'elle ne consomme aucun mock séquentiel.
beforeAll(async () => {
  queryMock.mockResolvedValueOnce({ rows: [{ n: 1 }] });
  await (await import('../../../../../lib/admin/schemaDroits')).droitEnvoiGestionDisponible();
  // LOCATION — même préchauffage pour la sonde de la migration 371, répondue « absente » : le SQL reste celui d'avant.
  queryMock.mockResolvedValueOnce({ rows: [{ n: 0 }] });
  await (await import('../../../../../lib/admin/schemaDroits')).droitLocationDisponible();
});

beforeEach(() => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  queryMock.mockReset();
});

async function req(session: SessionAdmin, body: unknown): Promise<Request> {
  const jeton = await signerJeton(session);
  return new Request('http://local/api/admin/comptes/5/role', {
    method: 'POST', headers: { cookie: `${NOM_COOKIE}=${jeton}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}
const admin = (): SessionAdmin => ({ sub: 1, identifiant: 'chef', role: 'administrateur', perms: permsToutes(), doitChanger: false, peutModifierPermis: true });
const collab = (): SessionAdmin => ({ sub: 3, identifiant: 'lea', role: 'collaborateur', perms: permsToutes(), doitChanger: false, peutModifierPermis: false });
const gardeAdmin = () => queryMock.mockResolvedValueOnce({ rows: [{ actif: true, role: 'administrateur' }] });
const cible = (role: string, actif = true) => ({ id: 5, identifiant: 'x@x.fr', prenom: 'X', nom: 'Y', role, actif, perm_pilotage: false, perm_cartes_annee: false, perm_statistiques: false, perm_internautes: false, perm_curation: false, perm_banc_test: false, doit_changer_mot_de_passe: false, derniere_connexion_a: null, cree_a: '2026' });

describe('POST /comptes/[id]/role — R-B (promotion) et R-C (jamais de rétrogradation)', () => {
  it('RÉTROGRADATION d’un administrateur → 403 RETROGRADATION_INTERDITE, aucune écriture', async () => {
    gardeAdmin();
    queryMock.mockResolvedValueOnce({ rows: [cible('administrateur')] }); // trouverCompteParId → admin
    const res = await postRole(await req(admin(), { role: 'collaborateur' }), ctx);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ erreur: 'RETROGRADATION_INTERDITE' });
    expect(queryMock).toHaveBeenCalledTimes(2); // garde + lecture, aucune mutation
  });

  it('PROMOTION collaborateur → administrateur → 200', async () => {
    gardeAdmin();
    queryMock
      .mockResolvedValueOnce({ rows: [cible('collaborateur')] }) // trouverCompteParId
      .mockResolvedValueOnce({ rows: [{ id: 5 }] }); // promouvoirAdministrateur
    const res = await postRole(await req(admin(), { role: 'administrateur' }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('appelant COLLABORATEUR (rôle réel en base) → 403 INTERDIT (double barrière)', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ actif: true, role: 'collaborateur' }] }); // garde lit le rôle RÉEL
    const res = await postRole(await req(collab(), { role: 'administrateur' }), ctx);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ erreur: 'INTERDIT' });
  });

  it('jeton au rôle PÉRIMÉ (JWS administrateur, base collaborateur) → 403', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ actif: true, role: 'collaborateur' }] });
    const jwtAdminPerime: SessionAdmin = { sub: 9, identifiant: 'ex', role: 'administrateur', perms: permsToutes(), doitChanger: false, peutModifierPermis: true };
    const res = await postRole(await req(jwtAdminPerime, { role: 'administrateur' }), ctx);
    expect(res.status).toBe(403);
  });
});

describe('POST /comptes/[id]/permissions — collaborateur seulement', () => {
  it('cible collaborateur → 200', async () => {
    gardeAdmin();
    queryMock.mockResolvedValueOnce({ rows: [{ id: 5 }] }); // modifierPermissions
    const res = await postPerms(await req(admin(), { perms: { curation: true } }), ctx);
    expect(res.status).toBe(200);
  });
  it('cible ADMINISTRATEUR (perms implicites) → 409 PERMS_ADMIN_IMPLICITES', async () => {
    gardeAdmin();
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // modifierPermissions : WHERE role=collaborateur ne matche pas
      .mockResolvedValueOnce({ rows: [cible('administrateur')] }); // trouverCompteParId diagnostic
    const res = await postPerms(await req(admin(), { perms: {} }), ctx);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ erreur: 'PERMS_ADMIN_IMPLICITES' });
  });
  it('appelant collaborateur → 403', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ actif: true, role: 'collaborateur' }] });
    const res = await postPerms(await req(collab(), { perms: {} }), ctx);
    expect(res.status).toBe(403);
  });
});

describe('POST /comptes/[id]/actif — R-D : un administrateur ne se (dés)active pas via l’UI', () => {
  it('désactivation d’un ADMINISTRATEUR → 403 ADMIN_CLI_UNIQUEMENT', async () => {
    gardeAdmin();
    queryMock
      .mockResolvedValueOnce({ rows: [{}] }) // pg_advisory_xact_lock
      .mockResolvedValueOnce({ rows: [] }) // desactiverCompte : WHERE role<>administrateur bloque
      .mockResolvedValueOnce({ rows: [cible('administrateur', true)] }); // trouverCompteParId diagnostic
    const res = await postActif(await req(admin(), { actif: false }), ctx);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ erreur: 'ADMIN_CLI_UNIQUEMENT' });
  });
});

describe('POST /comptes/[id]/actif — désactivation et révocation des sessions (point 4, 15/10/2026)', () => {
  it('désactiver un collaborateur RÉVOQUE ses sessions (version + 1) : une réactivation ne ferait pas revivre un ancien jeton', async () => {
    gardeAdmin();
    queryMock
      .mockResolvedValueOnce({ rows: [{}] }) // pg_advisory_xact_lock
      .mockResolvedValueOnce({ rows: [{ id: 5 }] }) // desactiverCompte : 1 ligne
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // revoquerSessions
    const res = await postActif(await req(admin(), { actif: false }), ctx);
    expect(res.status).toBe(200);
    const [sql, params] = queryMock.mock.calls[3];
    expect(String(sql)).toContain('SET session_version = session_version + 1');
    expect(params).toEqual([5]);
  });

  it('réactiver ne révoque rien (aucune requête de révocation)', async () => {
    gardeAdmin();
    queryMock.mockResolvedValueOnce({ rows: [{ id: 5 }] }); // reactiverCompte : 1 ligne
    expect((await postActif(await req(admin(), { actif: true }), ctx)).status).toBe(200);
    expect(queryMock.mock.calls.map((c) => String(c[0])).some((q) => q.includes('session_version'))).toBe(false);
  });
});
