import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock du pool pg (client.ts) — aucune vraie connexion ; on assère le SQL, les params, et le NOMBRE d'appels.
const queryMock = vi.fn();
vi.mock('../db/client', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));

import { exigerCompteActif } from './garde';
import { signerJeton, permsToutes, permsAucune, NOM_COOKIE, type SessionAdmin } from './session';

const SECRET = 'secret-de-test-suffisamment-long-pour-hs256-0123456789';

beforeEach(() => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  queryMock.mockReset();
});

/** Requête portant le cookie de session signé pour `session`. */
async function requete(session: SessionAdmin): Promise<Request> {
  const jeton = await signerJeton(session);
  return new Request('http://local/api/admin/curation/entites/1', {
    method: 'DELETE',
    headers: { cookie: `${NOM_COOKIE}=${jeton}` },
  });
}

const secours = (): SessionAdmin => ({ sub: null, identifiant: null, role: 'administrateur', perms: permsToutes(), doitChanger: false });
const admin = (): SessionAdmin => ({ sub: 1, identifiant: 'a.jorel@sansvisavis.com', role: 'administrateur', perms: permsToutes(), doitChanger: false });
const collab = (): SessionAdmin => ({ sub: 3, identifiant: 'lea@x.fr', role: 'collaborateur', perms: { ...permsAucune(), curation: true }, doitChanger: false });

async function corps(res: Response) {
  return res.json();
}

describe('exigerCompteActif — RÈGLE D’OR voie de secours', () => {
  it('sub = null → AUTORISÉ (null) et AUCUNE requête base émise', async () => {
    const res = await exigerCompteActif(await requete(secours()), 'curation');
    expect(res).toBeNull();
    expect(queryMock).not.toHaveBeenCalled(); // preuve : aucune requête (WHERE id=null enfermerait Arno)
  });
});

describe('exigerCompteActif — comptes nommés (relecture base)', () => {
  it('administrateur actif → autorisé, SELECT sur la bonne colonne + id', async () => {
    queryMock.mockResolvedValue({ rows: [{ actif: true, role: 'administrateur', perm: true }] });
    const res = await exigerCompteActif(await requete(admin()), 'pilotage');
    expect(res).toBeNull();
    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0];
    expect(String(sql)).toContain('perm_pilotage AS perm');
    expect(String(sql)).toContain('FROM admin_utilisateur WHERE id = $1');
    expect(params).toEqual([1]);
  });

  it('collaborateur actif AVEC la permission → autorisé', async () => {
    queryMock.mockResolvedValue({ rows: [{ actif: true, role: 'collaborateur', perm: true }] });
    expect(await exigerCompteActif(await requete(collab()), 'curation')).toBeNull();
  });

  it('collaborateur dont la permission a été RETIRÉE (JWS la porte encore) → 403 ACCES_REVOQUE', async () => {
    queryMock.mockResolvedValue({ rows: [{ actif: true, role: 'collaborateur', perm: false }] });
    const res = await exigerCompteActif(await requete(collab()), 'curation');
    expect(res?.status).toBe(403);
    expect(await corps(res!)).toEqual({ erreur: 'ACCES_REVOQUE' });
  });

  it('compte DÉSACTIVÉ (actif=false) → 403 ACCES_REVOQUE', async () => {
    queryMock.mockResolvedValue({ rows: [{ actif: false, role: 'administrateur', perm: true }] });
    const res = await exigerCompteActif(await requete(admin()), 'curation');
    expect(res?.status).toBe(403);
    expect(await corps(res!)).toEqual({ erreur: 'ACCES_REVOQUE' });
  });

  it('compte SUPPRIMÉ (0 ligne) → 403 ACCES_REVOQUE', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const res = await exigerCompteActif(await requete(admin()), 'curation');
    expect(res?.status).toBe(403);
    expect(await corps(res!)).toEqual({ erreur: 'ACCES_REVOQUE' });
  });

  it('collaborateur : administrateur en base outrepasse la colonne perm (rôle ⇒ toutes perms)', async () => {
    // Le compte a été promu administrateur en base : autorisé même si perm colonne = false.
    queryMock.mockResolvedValue({ rows: [{ actif: true, role: 'administrateur', perm: false }] });
    expect(await exigerCompteActif(await requete(collab()), 'curation')).toBeNull();
  });
});

describe('exigerCompteActif — session absente/illisible', () => {
  it('aucun cookie → 403 ACCES_REVOQUE, aucune requête base', async () => {
    const req = new Request('http://local/api/admin/curation/entites/1', { method: 'DELETE' });
    const res = await exigerCompteActif(req, 'curation');
    expect(res?.status).toBe(403);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('cookie au jeton falsifié → 403, aucune requête base', async () => {
    const jeton = await signerJeton(admin());
    const falsifie = `x${jeton}`; // en-tête corrompu → signature invalide de façon déterministe
    const req = new Request('http://local/x', { method: 'DELETE', headers: { cookie: `${NOM_COOKIE}=${falsifie}` } });
    const res = await exigerCompteActif(req, 'curation');
    expect(res?.status).toBe(403);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
