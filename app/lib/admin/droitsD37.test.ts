import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 🔴 D37 (Arno, 04/11/2026, migration 454) — UNE CASE POUR CHAQUE TUILE : « Audit » et « Sources de données » (perm_audit, perm_sources,
 * « non » pour tous les collaborateurs), « Les coûts » (perm_couts, option A : remplace « associé », pré-cochée pour les associés, réservée
 * aux administrateurs par « Voir »). « Administratif » reste au rôle (aucune case). On éprouve le COMPORTEMENT, jamais la forme du SQL.
 */
const queryMock = vi.fn();
vi.mock('../db/client', () => ({
  query: (...args: unknown[]) => queryMock(...args),
  withTransaction: (fn: (q: (...a: unknown[]) => unknown) => unknown) => fn((...a: unknown[]) => queryMock(...a)),
}));
vi.mock('./motDePasse', () => ({ hacher: (clair: string) => Promise.resolve(`HASH:${clair}`) }));
vi.mock('./statutCompte', () => ({ statutDuCompte: async (id: number) => (id === 2 || id === 9 ? 'associe' : id === 5 ? 'salarie' : null) }));

import { signerJeton, permsAucune, NOM_COOKIE, type SessionAdmin } from './session';
import { modifierPermissions, permsDuCompte, trouverCompte, type CompteDB } from './comptes';
import { oublierSchemaDroits } from './schemaDroits';
import { exigerModuleD37 } from './garde';
import { definirDroitCouts, lireDroitCouts } from './droitCouts';
import { peutVoirCouts } from '../mon-espace/compteRepo';
import { ongletCoutsVisible } from '../mon-espace/couts';

const SECRET = 'secret-de-test-suffisamment-long-pour-hs256-0123456789';
/** La base simulée : la sonde de la 454 (perm_couts) répond selon `avec454` ; un compte = { role, perm_* }. */
function base(avec454: boolean, comptes: Record<number, Record<string, unknown>> = {}) {
  oublierSchemaDroits();
  queryMock.mockReset();
  queryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
    const s = String(sql);
    if (s.includes('information_schema.columns')) return { rows: [{ n: ['perm_couts', 'perm_audit', 'perm_sources'].includes(String(params?.[1])) ? (avec454 ? 1 : 0) : 1 }] };
    const c = comptes[Number(params?.[0])];
    if (c === undefined) return { rows: [] };
    if (s.includes('AS perm FROM admin_utilisateur')) { const m = /(perm_\w+) AS perm/.exec(s)![1]; return { rows: [{ actif: true, role: c.role, perm: c[m] === true }] }; }
    if (s.includes('AS couts FROM admin_utilisateur')) return { rows: [{ role: c.role, prenom: 'P', couts: s.includes('perm_couts') ? c.perm_couts ?? false : null }] };
    if (s.includes('SELECT actif, role FROM')) return { rows: [{ actif: true, role: c.role }] };
    if (s.includes('perm_couts AS valeur')) return { rows: [{ valeur: c.perm_couts === true }] };
    return { rows: [{ id: params?.[0], ...c }] };
  });
}
const appelMetier = () => {
  const c = queryMock.mock.calls.find((x) => String(x[0]).includes('admin_utilisateur') && !String(x[0]).includes('information_schema'));
  return { sql: String(c?.[0] ?? '').replace(/\s+/g, ' '), params: (c?.[1] ?? []) as unknown[] };
};
const session = (sub: number, role: SessionAdmin['role']): SessionAdmin => ({ sub, identifiant: 'x', role, perms: permsAucune(), doitChanger: false, peutModifierPermis: false });
const requete = async (s: SessionAdmin) => new Request('http://local/api/admin/audit', { headers: { cookie: `${NOM_COOKIE}=${await signerJeton(s)}` } });

beforeEach(() => { process.env.ADMIN_SESSION_SECRET = SECRET; queryMock.mockReset(); oublierSchemaDroits(); });

describe('🔴 D37 — la garde des routes Audit et Sources (exigerModuleD37)', () => {
  it('avec la 454 : collaborateur sans la case → refus ; avec la case → admis ; administrateur → admis', async () => {
    base(true, { 4: { role: 'collaborateur', perm_audit: false, perm_sources: true }, 2: { role: 'administrateur' } });
    expect('refus' in (await exigerModuleD37(await requete(session(4, 'collaborateur')), 'audit'))).toBe(true);
    expect(await exigerModuleD37(await requete(session(4, 'collaborateur')), 'sources')).toEqual({ auteurId: 4 });
    expect(await exigerModuleD37(await requete(session(2, 'administrateur')), 'audit')).toEqual({ auteurId: 2 });
  });
  it('sans la 454 : administrateurs seulement (la règle d’avant), la colonne absente n’est jamais nommée', async () => {
    base(false, { 4: { role: 'collaborateur', perm_audit: true }, 2: { role: 'administrateur' } });
    expect('refus' in (await exigerModuleD37(await requete(session(4, 'collaborateur')), 'audit'))).toBe(true);
    expect(await exigerModuleD37(await requete(session(2, 'administrateur')), 'audit')).toEqual({ auteurId: 2 });
    expect(queryMock.mock.calls.some((x) => String(x[0]).includes('perm_audit'))).toBe(false);
  });
});

describe('🔴 D37 — la lecture et l’écriture des cases Audit et Sources (écran des comptes)', () => {
  it('sans la 454 : la connexion ne nomme pas les colonnes, et les droits valent « non »', async () => {
    base(false, { 3: { role: 'collaborateur' } });
    queryMock.mockImplementationOnce(async () => ({ rows: [{ n: 1 }] }));
    const c = await trouverCompte('lea');
    const { sql } = appelMetier();
    expect(sql).toContain('false AS perm_audit, false AS perm_sources');
    expect(permsDuCompte({ ...(c as CompteDB), role: 'collaborateur' })).toMatchObject({ audit: false, sources: false });
  });
  it('avec la 454 : les cases s’écrivent comme paramètres LIÉS ; sans elle, rien n’est nommé', async () => {
    base(true, { 42: { role: 'collaborateur' } });
    expect(await modifierPermissions(42, { ...permsAucune(), audit: true, sources: false }, false, 7)).toBe(true);
    const { sql, params } = appelMetier();
    const nA = Number(/perm_audit = \$(\d+)/.exec(sql)![1]); const nS = Number(/perm_sources = \$(\d+)/.exec(sql)![1]);
    expect([params[nA - 1], params[nS - 1]]).toEqual([true, false]);
    base(false, { 42: { role: 'collaborateur' } });
    await modifierPermissions(42, { ...permsAucune(), audit: true }, false, 7);
    expect(appelMetier().sql).not.toMatch(/perm_audit|perm_sources/);
  });
  it('administrateur : Audit et Sources d’office, quelles que soient ses colonnes', () => {
    expect(permsDuCompte({ role: 'administrateur', perm_audit: false, perm_sources: false } as unknown as CompteDB)).toMatchObject({ audit: true, sources: true });
  });
});

describe('🔴 D37 — « Les coûts » : la case remplace « associé », réservée aux administrateurs (« Voir »)', () => {
  // Arnaud (2) et Cédric (9) : administrateurs associés ; PONS (5) : collaborateur salarié ; 7 : administrateur NON associé
  const COMPTES = { 2: { role: 'administrateur', perm_couts: true }, 9: { role: 'administrateur', perm_couts: true }, 5: { role: 'collaborateur', perm_couts: true },
    7: { role: 'administrateur', perm_couts: false } };
  it('avec la 454 : la case fait foi pour un administrateur ; un collaborateur, même coché, n’y a pas accès', async () => {
    base(true, COMPTES);
    expect([await peutVoirCouts(2), await peutVoirCouts(9), await peutVoirCouts(5), await peutVoirCouts(7)]).toEqual([true, true, false, false]);
  });
  it('sans la 454 : la règle d’avant (associé ET administrateur) — les mêmes accès pour les associés d’aujourd’hui', async () => {
    base(false, COMPTES);
    expect([await peutVoirCouts(2), await peutVoirCouts(9), await peutVoirCouts(5), await peutVoirCouts(7)]).toEqual([true, true, false, false]);
  });
  it('l’onglet (écran) : la case quand elle est connue, sinon « associé » ; toujours dans « Voir » et administrateur', () => {
    expect(ongletCoutsVisible({ couts: true, administrateur: true }, 'criterimmo')).toBe(true);
    expect(ongletCoutsVisible({ couts: false, associe: true, administrateur: true }, 'criterimmo')).toBe(false);
    expect(ongletCoutsVisible({ associe: true, administrateur: true }, 'macj')).toBe(true); // une réponse d'avant ce lot
    expect(ongletCoutsVisible({ couts: true, administrateur: false }, 'criterimmo')).toBe(false);
    expect(ongletCoutsVisible({ couts: true, administrateur: true }, null)).toBe(false);
  });
  it('la case se lit, s’écrit (administrateur compris) avec son journal ; sans la 454 : rien n’est écrit', async () => {
    base(true, COMPTES);
    expect(await lireDroitCouts(7)).toEqual({ valeur: false, disponible: true });
    expect(await definirDroitCouts(7, true, 2)).toBe(true);
    const ecrit = queryMock.mock.calls.find((x) => String(x[0]).includes('UPDATE admin_utilisateur u SET perm_couts'))!;
    expect(String(ecrit[0]).replace(/\s+/g, ' ')).toContain("INSERT INTO admin_utilisateur_log (action, cible_id, auteur_id, avant, apres) SELECT 'changement_permissions'");
    expect(ecrit[1]).toEqual([7, true, 2]);
    base(false, COMPTES);
    expect(await lireDroitCouts(7)).toEqual({ valeur: false, disponible: false });
    expect(await definirDroitCouts(7, true, 2)).toBe(false);
    expect(queryMock.mock.calls.some((x) => String(x[0]).includes('UPDATE'))).toBe(false);
  });
});
