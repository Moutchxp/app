import { describe, it, expect, vi, beforeEach } from 'vitest';

const { q } = vi.hoisted(() => ({ q: vi.fn() }));
vi.mock('../db/client', () => ({ query: q }));
vi.mock('server-only', () => ({}));

import { empreinteMotDePasse, lireEtatCompte, verdictSession, revoquerSessions, type EtatCompte } from './etatSession';
import { permsAucune, permsToutes, type SessionAdmin } from './session';

beforeEach(() => { q.mockReset(); vi.restoreAllMocks(); });

const collab = (perms = { ...permsAucune(), curation: true }): SessionAdmin => ({ sub: 3, identifiant: 'lea', role: 'collaborateur', perms, doitChanger: false, peutModifierPermis: false });
const etat = (over: Partial<EtatCompte> = {}): EtatCompte => ({ actif: true, role: 'collaborateur', perms: { ...permsAucune(), curation: true }, empreinteMdp: 'E1', versionSession: null, ...over });

describe('empreinteMotDePasse', () => {
  it('32 caractères hexadécimaux, stable, différente pour un autre hash, sans rien du hash', () => {
    const e = empreinteMotDePasse('$argon2id$v=19$m=65536,t=3,p=4$sel$hash');
    expect(e).toMatch(/^[0-9a-f]{32}$/);
    expect(empreinteMotDePasse('$argon2id$v=19$m=65536,t=3,p=4$sel$hash')).toBe(e);
    expect(empreinteMotDePasse('$argon2id$v=19$m=65536,t=3,p=4$sel$autre')).not.toBe(e);
    expect(e).not.toContain('argon');
  });
});

describe('verdictSession (pur)', () => {
  it('compte absent / inactif → refusé, avec le motif', () => {
    expect(verdictSession({}, collab(), null)).toEqual({ valide: false, motif: 'compte_absent' });
    expect(verdictSession({}, collab(), etat({ actif: false }))).toEqual({ valide: false, motif: 'compte_inactif' });
  });

  it('empreinte du jeton ≠ base (mot de passe changé) → refusé ; jeton SANS empreinte (avant ce lot) → contrôle sauté', () => {
    expect(verdictSession({ emp: 'E0' }, collab(), etat())).toEqual({ valide: false, motif: 'mot_de_passe_change' });
    expect(verdictSession({}, collab(), etat()).valide).toBe(true);
  });

  it('version de session : comparée seulement quand la colonne existe ; jeton sans ver = 0', () => {
    expect(verdictSession({ emp: 'E1', ver: 1 }, collab(), etat({ versionSession: 2 }))).toEqual({ valide: false, motif: 'session_revoquee' });
    expect(verdictSession({ emp: 'E1' }, collab(), etat({ versionSession: 1 }))).toEqual({ valide: false, motif: 'session_revoquee' });
    expect(verdictSession({ emp: 'E1' }, collab(), etat({ versionSession: 0 })).valide).toBe(true);
    expect(verdictSession({ emp: 'E1', ver: 5 }, collab(), etat({ versionSession: null })).valide).toBe(true); // migration 356 absente
  });

  it('🔴 Arno (21/10/2026) — droits et rôle EFFECTIFS = ceux de la BASE : un retrait ET un ajout valent tout de suite, sans reconnexion', () => {
    const v = verdictSession({}, collab({ ...permsAucune(), curation: true, gestion: true }), etat({ perms: { ...permsAucune(), curation: true } }));
    expect(v.valide && v.perms).toEqual({ ...permsAucune(), curation: true }); // gestion retirée en base → retirée tout de suite
    const ajout = verdictSession({}, collab(), etat({ perms: { ...permsAucune(), curation: true, location: true, gestion: true } }));
    expect(ajout.valide && ajout.perms).toEqual({ ...permsAucune(), curation: true, location: true, gestion: true }); // ajout : tout de suite
    // Jeton administrateur, compte collaborateur en base → collaborateur (jamais plus que la base).
    const admin: SessionAdmin = { ...collab(permsToutes()), role: 'administrateur' };
    expect(verdictSession({}, admin, etat())).toEqual({ valide: true, role: 'collaborateur', perms: { ...permsAucune(), curation: true } });
    // Administrateur en base : toutes permissions (promotion comprise) ; un administrateur n'est jamais affecté.
    expect(verdictSession({}, admin, etat({ role: 'administrateur', perms: permsToutes() }))).toEqual({ valide: true, role: 'administrateur', perms: permsToutes() });
    expect(verdictSession({}, collab(), etat({ role: 'administrateur', perms: permsAucune() }))).toEqual({ valide: true, role: 'administrateur', perms: permsToutes() });
    // Les refus d'avant ne changent pas : inactif, mot de passe changé, session révoquée.
    expect(verdictSession({}, collab(), etat({ actif: false }))).toEqual({ valide: false, motif: 'compte_inactif' });
    expect(verdictSession({ emp: 'E0' }, collab(), etat())).toEqual({ valide: false, motif: 'mot_de_passe_change' });
    expect(verdictSession({ ver: 1 }, collab(), etat({ versionSession: 2 }))).toEqual({ valide: false, motif: 'session_revoquee' });
  });
});

describe('lireEtatCompte', () => {
  it('🔴 un droit dont la migration manque (perm_transaction sans la 433) vaut « non », jamais une erreur SQL (503 de recette du 27/10/2026)', async () => {
    q.mockResolvedValueOnce({ rows: [{ actif: true, role: 'collaborateur', mot_de_passe: 'H', perm_curation: 'true', perm_location: 'false', perm_transaction: null, version: null }] });
    const e = await lireEtatCompte(3);
    expect(e?.perms).toMatchObject({ curation: true, location: false, transaction: false });
    const sql = String(q.mock.calls.at(-1)?.[0]).replace(/\s+/g, ' ');
    expect(sql).not.toMatch(/u\.perm_/);
    expect(sql).toContain("to_jsonb(u) ->> 'perm_transaction' AS perm_transaction");
  });
  it('une requête par clé primaire ; version lue sans nommer la colonne (to_jsonb), donc sans migration', async () => {
    q.mockResolvedValueOnce({ rows: [{ actif: true, role: 'collaborateur', mot_de_passe: 'H', perm_curation: true, perm_gestion: false, version: null }] });
    const e = await lireEtatCompte(3);
    const [sql, params] = q.mock.calls[0];
    expect(String(sql).replace(/\s+/g, ' ')).toContain("to_jsonb(u) ->> 'session_version' AS version");
    expect(String(sql)).not.toMatch(/u\.session_version/);
    expect(params).toEqual([3]);
    // LOT P — le statut lu via to_jsonb (null sans la 439 : personne n'est observateur).
    expect(e).toEqual({ actif: true, role: 'collaborateur', perms: { ...permsAucune(), curation: true }, empreinteMdp: empreinteMotDePasse('H'), versionSession: null, statut: null });
  });

  it('version présente (migration 356 appliquée) → nombre ; compte absent → null ; administrateur → tous droits', async () => {
    q.mockResolvedValueOnce({ rows: [{ actif: true, role: 'administrateur', mot_de_passe: 'H', version: '4' }] });
    expect(await lireEtatCompte(1)).toMatchObject({ role: 'administrateur', perms: permsToutes(), versionSession: 4 });
    q.mockResolvedValueOnce({ rows: [] });
    expect(await lireEtatCompte(9)).toBeNull();
  });
});

describe('revoquerSessions', () => {
  it('incrémente la version du compte', async () => {
    q.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    expect(await revoquerSessions(3)).toBe(true);
    expect(q.mock.calls[0]).toEqual(['UPDATE admin_utilisateur SET session_version = session_version + 1 WHERE id = $1', [3]]);
  });

  it('migration 356 non appliquée (colonne absente, 42703) → false, sans bruit ni exception', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    q.mockRejectedValueOnce(Object.assign(new Error('column "session_version" does not exist'), { code: '42703' }));
    expect(await revoquerSessions(3)).toBe(false);
    expect(err).not.toHaveBeenCalled();
  });

  it('autre erreur → false, journalisée, jamais remontée', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    q.mockRejectedValueOnce(new Error('down'));
    expect(await revoquerSessions(3)).toBe(false);
    expect(err).toHaveBeenCalledTimes(1);
  });
});
