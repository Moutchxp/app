import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock du pool pg (client.ts) — aucune vraie connexion ; on assère le SQL, les params, et le NOMBRE d'appels.
const queryMock = vi.fn();
vi.mock('../db/client', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));

import { SignJWT } from 'jose';
import { exigerCompteActif, exigerModule, exigerAdministrateur, exigerCapaciteModif } from './garde';
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

const secours = (): SessionAdmin => ({ sub: null, identifiant: null, role: 'administrateur', perms: permsToutes(), doitChanger: false, peutModifierPermis: true });
const admin = (): SessionAdmin => ({ sub: 1, identifiant: 'a.jorel@sansvisavis.com', role: 'administrateur', perms: permsToutes(), doitChanger: false, peutModifierPermis: true });
const collab = (): SessionAdmin => ({ sub: 3, identifiant: 'lea@x.fr', role: 'collaborateur', perms: { ...permsAucune(), curation: true }, doitChanger: false, peutModifierPermis: false });
const collabPermis = (): SessionAdmin => ({ sub: 3, identifiant: 'lea@x.fr', role: 'collaborateur', perms: { ...permsAucune(), permis: true }, doitChanger: false, peutModifierPermis: false });

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

describe('exigerModule — RATT-EDIT (lot A2) : garde d’un module (perm_permis) avec auteurId (routes CONVERTIES)', () => {
  it('voie de secours (sub=null) → autorisé {auteurId:null}, AUCUNE requête base', async () => {
    const g = await exigerModule(await requete(secours()), 'permis');
    expect(g).toEqual({ auteurId: null });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('collaborateur AVEC perm_permis → autorisé {auteurId} (SELECT perm_permis)', async () => {
    queryMock.mockResolvedValue({ rows: [{ actif: true, role: 'collaborateur', perm: true }] });
    expect(await exigerModule(await requete(collabPermis()), 'permis')).toEqual({ auteurId: 3 });
    expect(String(queryMock.mock.calls[0][0])).toContain('perm_permis AS perm');
  });

  it('collaborateur SANS perm_permis (retiré en base) → refus 403 (defense in depth)', async () => {
    queryMock.mockResolvedValue({ rows: [{ actif: true, role: 'collaborateur', perm: false }] });
    const g = await exigerModule(await requete(collabPermis()), 'permis');
    expect('refus' in g).toBe(true);
    if ('refus' in g) expect(g.refus.status).toBe(403);
  });

  it('administrateur → autorisé {auteurId} (rôle ⇒ toutes perms, colonne outrepassée)', async () => {
    queryMock.mockResolvedValue({ rows: [{ actif: true, role: 'administrateur', perm: false }] });
    expect(await exigerModule(await requete(admin()), 'permis')).toEqual({ auteurId: 1 });
  });

  it('compte désactivé → refus 403', async () => {
    queryMock.mockResolvedValue({ rows: [{ actif: false, role: 'collaborateur', perm: true }] });
    const g = await exigerModule(await requete(collabPermis()), 'permis');
    expect('refus' in g).toBe(true);
  });
});

describe('RATT-EDIT (lot A2) — routes MAINTENUES admin-only : un collaborateur AVEC perm_permis reste REFUSÉ', () => {
  it('exigerAdministrateur (garde des routes maintenues : reglages/depot/relever/repondre…) refuse un collaborateur même avec perm_permis → 403', async () => {
    queryMock.mockResolvedValue({ rows: [{ actif: true, role: 'collaborateur' }] }); // role != administrateur
    const g = await exigerAdministrateur(await requete(collabPermis()));
    expect('refus' in g).toBe(true);
    if ('refus' in g) expect(g.refus.status).toBe(403);
  });

  it('… et l’ADMINISTRATEUR passe ces mêmes routes maintenues', async () => {
    queryMock.mockResolvedValue({ rows: [{ actif: true, role: 'administrateur' }] });
    expect(await exigerAdministrateur(await requete(admin()))).toEqual({ auteurId: 1 });
  });
});

describe('exigerCapaciteModif — RATT-EDIT (lot A3) : sous-droit « modifier après validation » (garde générique, subordination ①)', () => {
  it('collaborateur AVEC perm_permis ET perm_permis_modif → autorisé (null)', async () => {
    queryMock.mockResolvedValue({ rows: [{ actif: true, role: 'collaborateur', permis: true, modif: true }] });
    expect(await exigerCapaciteModif(await requete(collabPermis()))).toBeNull();
    expect(String(queryMock.mock.calls[0][0])).toContain('perm_permis AS permis');
    expect(String(queryMock.mock.calls[0][0])).toContain('perm_permis_modif AS modif');
  });

  it('collaborateur AVEC perm_permis mais SANS perm_permis_modif → 403', async () => {
    queryMock.mockResolvedValue({ rows: [{ actif: true, role: 'collaborateur', permis: true, modif: false }] });
    const res = await exigerCapaciteModif(await requete(collabPermis()));
    expect(res?.status).toBe(403);
  });

  it('🔴 SUBORDINATION ① (LE test du lot) : perm_permis_modif SANS perm_permis → AUCUN geste, 403', async () => {
    // Le sous-droit ne vaut RIEN sans le droit parent — garde SERVEUR, jamais l'interface seule.
    queryMock.mockResolvedValue({ rows: [{ actif: true, role: 'collaborateur', permis: false, modif: true }] });
    const res = await exigerCapaciteModif(await requete(collabPermis()));
    expect(res?.status).toBe(403);
  });

  it('administrateur → autorisé (permissions implicites, colonnes outrepassées)', async () => {
    queryMock.mockResolvedValue({ rows: [{ actif: true, role: 'administrateur', permis: false, modif: false }] });
    expect(await exigerCapaciteModif(await requete(admin()))).toBeNull();
  });

  it('voie de secours (sub=null) → autorisé (null), AUCUNE requête', async () => {
    expect(await exigerCapaciteModif(await requete(secours()))).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('compte désactivé → 403', async () => {
    queryMock.mockResolvedValue({ rows: [{ actif: false, role: 'collaborateur', permis: true, modif: true }] });
    expect((await exigerCapaciteModif(await requete(collabPermis())))?.status).toBe(403);
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

describe('FAIL-CLOSED (M1) — jeton SIGNÉ mais MAL FORMÉ (sub null, sans rôle administrateur) → REFUSÉ, jamais admin', () => {
  // Forge un jeton VALIDEMENT SIGNÉ (même secret) mais au payload mal formé : ni sub, ni rôle administrateur explicite.
  //   Simule le rayon d'une fuite du secret de signature : sans claim positive « role: administrateur », aucun accès.
  async function requeteForgee(payload: Record<string, unknown>): Promise<Request> {
    const jeton = await new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('8h').sign(new TextEncoder().encode(SECRET));
    return new Request('http://local/api/admin/x', { method: 'DELETE', headers: { cookie: `${NOM_COOKIE}=${jeton}` } });
  }

  it('payload VIDE {} → exigerAdministrateur REFUSE (403), AUCUNE requête base (plus de raccourci sub-null)', async () => {
    const g = await exigerAdministrateur(await requeteForgee({}));
    expect('refus' in g).toBe(true);
    if ('refus' in g) expect(g.refus.status).toBe(403);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('payload au rôle INCONNU { role:"admin" } → exigerModule REFUSE (403), aucune requête base', async () => {
    const g = await exigerModule(await requeteForgee({ role: 'admin' }), 'permis');
    expect('refus' in g).toBe(true);
    if ('refus' in g) expect(g.refus.status).toBe(403);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('payload VIDE {} → exigerCompteActif ET exigerCapaciteModif REFUSENT (403), aucune requête base', async () => {
    expect((await exigerCompteActif(await requeteForgee({}), 'curation'))?.status).toBe(403);
    expect((await exigerCapaciteModif(await requeteForgee({})))?.status).toBe(403);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('NON-RÉGRESSION : la VRAIE voie de secours (sub null AVEC role administrateur) reste AUTORISÉE, sans requête', async () => {
    expect(await exigerCompteActif(await requete(secours()), 'curation')).toBeNull();
    expect(await exigerModule(await requete(secours()), 'permis')).toEqual({ auteurId: null });
    expect(await exigerCapaciteModif(await requete(secours()))).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });
});
