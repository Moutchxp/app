import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * 🔴 TUILE « MON ESPACE » (Arno, 02/11/2026, lot 1 de docs/PLAN_MON_ESPACE.md) — le droit `perm_mon_espace` (migration 448, livrée
 * NON appliquée). On éprouve le COMPORTEMENT : qui passe le proxy, ce que lit la connexion avec et sans la colonne, ce qu'écrit la
 * case de l'écran des comptes, ce que décide la page. Jamais la forme exacte du SQL.
 */

const queryMock = vi.fn();
vi.mock('../db/client', () => ({
  query: (...args: unknown[]) => queryMock(...args),
  withTransaction: (fn: (q: (...a: unknown[]) => unknown) => unknown) => fn((...a: unknown[]) => queryMock(...a)),
}));
vi.mock('./motDePasse', () => ({ hacher: (clair: string) => Promise.resolve(`HASH:${clair}`) }));
// Le proxy relit le compte en base : ici, la base est le miroir du jeton (mêmes rôle et droits).
const { lireEtatCompte } = vi.hoisted(() => ({ lireEtatCompte: vi.fn() }));
vi.mock('./etatSession', async () => ({ ...(await vi.importActual<typeof import('./etatSession')>('./etatSession')), lireEtatCompte }));

import { proxy } from '../../../proxy';
import { signerJeton, permsToutes, permsAucune, NOM_COOKIE, type SessionAdmin } from './session';
import { modifierPermissions, permsDuCompte, trouverCompte, type CompteDB } from './comptes';
import { oublierSchemaDroits } from './schemaDroits';
import { decisionMonEspace, salutation } from '../../(admin)/admin/(protected)/mon-espace/acces';

const SECRET = 'secret-de-test-suffisamment-long-pour-hs256-0123456789';
const collab = (perms = permsAucune()): SessionAdmin => ({ sub: 3, identifiant: 'lea', role: 'collaborateur', perms, doitChanger: false, peutModifierPermis: false });
const admin = (): SessionAdmin => ({ sub: 1, identifiant: 'arno', role: 'administrateur', perms: permsToutes(), doitChanger: false, peutModifierPermis: true });

async function requete(pathname: string, s: SessionAdmin): Promise<NextRequest> {
  lireEtatCompte.mockResolvedValue({ actif: true, role: s.role, perms: s.role === 'administrateur' ? permsToutes() : s.perms, empreinteMdp: 'emp', versionSession: null });
  return new NextRequest(new URL(`http://local${pathname}`), { headers: { cookie: `${NOM_COOKIE}=${await signerJeton({ ...s, empreinteMdp: 'emp' })}` } });
}

/** La base simulée : la sonde de schéma répond selon `colonne`, le reste rend `ligne`. */
function base(colonne: boolean, ligne: Record<string, unknown> = { id: 42 }) {
  oublierSchemaDroits();
  queryMock.mockReset();
  queryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (String(sql).includes('information_schema.columns')) {
      return { rows: [{ n: params?.[1] === 'perm_mon_espace' ? (colonne ? 1 : 0) : 1 }] };
    }
    return { rows: [ligne] };
  });
}
const appelMetier = () => {
  const c = queryMock.mock.calls.find((x) => String(x[0]).includes('admin_utilisateur') && !String(x[0]).includes('information_schema'));
  return { sql: String(c?.[0] ?? '').replace(/\s+/g, ' '), params: (c?.[1] ?? []) as unknown[] };
};

beforeEach(() => { process.env.ADMIN_SESSION_SECRET = SECRET; queryMock.mockReset(); oublierSchemaDroits(); });

describe('🔴 le proxy garde la page ET l’API de « Mon espace »', () => {
  it('droit absent → la page renvoie vers l’accueil, l’API répond 403', async () => {
    const page = await proxy(await requete('/admin/mon-espace', collab({ ...permsAucune(), transaction: true })));
    expect(page.status).toBe(307);
    expect(page.headers.get('location')).toMatch(/\/admin$/);
    expect((await proxy(await requete('/api/admin/mon-espace', collab()))).status).toBe(403);
  });
  it('droit présent → la page et l’API passent', async () => {
    const avec = collab({ ...permsAucune(), mon_espace: true });
    const page = await proxy(await requete('/admin/mon-espace', avec));
    expect(page.status).not.toBe(307);
    expect(page.headers.get('location')).toBeNull();
    expect((await proxy(await requete('/api/admin/mon-espace', avec))).status).not.toBe(403);
  });
  it('administrateur → toujours admis, même sans aucune case cochée en base', async () => {
    const page = await proxy(await requete('/admin/mon-espace', admin()));
    expect(page.headers.get('location')).toBeNull();
    expect((await proxy(await requete('/api/admin/mon-espace', admin()))).status).not.toBe(403);
  });
  it('le droit « Mon espace » n’ouvre rien d’autre (ni la Transaction, ni les comptes)', async () => {
    const avec = collab({ ...permsAucune(), mon_espace: true });
    expect((await proxy(await requete('/admin/transaction', avec))).headers.get('location')).toMatch(/\/admin$/);
    expect((await proxy(await requete('/api/admin/transaction', avec))).status).toBe(403);
  });
});

describe('🔴 ancien schéma (migration 448 non appliquée) : la connexion ne plante pas', () => {
  it('sans la colonne : la lecture du compte ne la nomme pas, et le droit vaut « non »', async () => {
    base(false, { id: 3, role: 'collaborateur', perm_mon_espace: false });
    const c = await trouverCompte('lea');
    const { sql } = appelMetier();
    expect(sql).toContain('false AS perm_mon_espace');
    expect(sql.replace('false AS perm_mon_espace', '')).not.toContain('perm_mon_espace'); // la colonne absente n'est jamais nommée
    expect(permsDuCompte(c as CompteDB).mon_espace).toBe(false);
  });
  it('avec la colonne : elle est lue, et le droit coché vaut « oui »', async () => {
    base(true, { id: 3, role: 'collaborateur', perm_mon_espace: true });
    const c = await trouverCompte('lea');
    expect(appelMetier().sql).not.toContain('false AS perm_mon_espace');
    expect(permsDuCompte(c as CompteDB).mon_espace).toBe(true);
  });
  it('administrateur : droit d’office, quelle que soit sa colonne', () => {
    expect(permsDuCompte({ role: 'administrateur', perm_mon_espace: false } as unknown as CompteDB).mon_espace).toBe(true);
  });
});

describe('la case « Mon espace » de l’écran des comptes', () => {
  const PERMS = { ...permsAucune(), mon_espace: true };
  it('schéma à jour : la case est écrite comme paramètre LIÉ', async () => {
    base(true);
    expect(await modifierPermissions(42, PERMS, false, 7)).toBe(true);
    const { sql, params } = appelMetier();
    expect(sql).toMatch(/perm_mon_espace = \$\d+::boolean/);
    const n = Number(/perm_mon_espace = \$(\d+)/.exec(sql)![1]);
    expect(params[n - 1]).toBe(true);
  });
  it('ancien schéma : la case n’écrit rien (aucune colonne nommée), les autres droits s’écrivent comme avant', async () => {
    base(false);
    expect(await modifierPermissions(42, PERMS, false, 7)).toBe(true);
    const { sql } = appelMetier();
    expect(sql).not.toContain('perm_mon_espace');
    expect(sql).toContain('perm_transaction');
  });
});

describe('la page /admin/mon-espace', () => {
  it('droit absent → refusée, aucun prénom exposé', () => {
    expect(decisionMonEspace(collab({ ...permsAucune(), transaction: true }), 'Léa')).toEqual({ autorise: false, prenom: null });
    expect(decisionMonEspace(null, null)).toEqual({ autorise: false, prenom: null });
  });
  it('droit présent → ouverte, « Bonjour <Prénom>, votre espace »', () => {
    const d = decisionMonEspace(collab({ ...permsAucune(), mon_espace: true }), ' Léa ');
    expect(d).toEqual({ autorise: true, prenom: 'Léa' });
    expect(salutation(d.prenom)).toBe('Bonjour Léa, votre espace');
  });
  it('administrateur → toujours ouverte ; sans prénom connu (accès de secours) : « Bonjour, votre espace »', () => {
    expect(decisionMonEspace(admin(), null)).toEqual({ autorise: true, prenom: null });
    expect(salutation(null)).toBe('Bonjour, votre espace');
  });
});
