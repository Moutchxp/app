import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 TRANSACTION, LOT D (434) — la société d'un collaborateur, datée. Sans la 434 : lue « non disponible » SANS requête, rien ne s'écrit
 * (l'admin fonctionne comme avant). Avec : une période neuve, signée ; la même société ne réécrit rien ; une date déjà posée est retirée
 * (jamais supprimée) puis remplacée. Base simulée.
 */
const lotD = vi.fn<() => Promise<boolean>>();
const lotK = vi.fn<() => Promise<boolean>>(async () => false);
vi.mock('./schemaDroits', () => ({ repartitionDisponible: () => lotD(), societeLesDeuxDisponible: () => lotK() }));
const appels: { sql: string; params: unknown[] }[] = [];
let periodes: { id: string; societe: string; depuis: string }[] = [];
const q = vi.fn(async (sql: string, params: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ');
  appels.push({ sql: s, params });
  if (s.startsWith('SELECT id FROM admin_utilisateur')) return { rows: [{ id: '5' }] };
  if (s.includes('FROM transaction_societe_compte')) return { rows: periodes.map((p) => ({ ...p, compte_id: '5', origine: 'saisie', pose_le: '2026-10-27 10:00', pose_par_libelle: 'a.jorel', motif: null })) };
  return { rows: [] };
});
vi.mock('../db/client', () => ({ query: (s: string, p: unknown[]) => q(s, p), withTransaction: async (fn: (x: typeof q) => unknown) => fn(q) }));
const m = await import('./societeCompte');
const A = { id: 2, libelle: 'a.jorel@sansvisavis.com' };
beforeEach(() => { appels.length = 0; periodes = []; lotD.mockResolvedValue(true); lotK.mockResolvedValue(false); });

describe('sans la migration 434', () => {
  it('lue « non disponible », sans une requête ; écrire est refusé avec le motif', async () => {
    lotD.mockResolvedValue(false);
    expect(await m.lireSocieteCompte(5)).toEqual({ valeur: null, disponible: false, periodes: [] });
    expect((await m.societesDesComptes([5])).size).toBe(0);
    expect(await m.definirSocieteCompte(5, 'macj', '2026-10-27', A)).toEqual({ ok: false, motif: expect.stringMatching(/migration 434/) });
    expect(appels).toEqual([]);
  });
});

describe('avec la 434', () => {
  it('une société inconnue est refusée', async () => {
    expect((await m.definirSocieteCompte(5, 'autre', '2026-10-27', A)).ok).toBe(false);
  });
  it('pose une période neuve, signée, à compter de la date', async () => {
    expect(await m.definirSocieteCompte(5, 'criterimmo', '2026-10-27', A)).toEqual({ ok: true, change: true });
    const ins = appels.find((x) => x.sql.startsWith('INSERT INTO transaction_societe_compte'))!;
    expect(ins.params).toEqual([5, 'criterimmo', '2026-10-27', 'saisie', null, 2, 'a.jorel@sansvisavis.com']);
  });
  it('la même société : rien n’est écrit ; un changement s’ajoute sans réécrire le passé', async () => {
    periodes = [{ id: '1', societe: 'criterimmo', depuis: '2000-01-01' }];
    expect(await m.definirSocieteCompte(5, 'criterimmo', '2026-10-27', A)).toEqual({ ok: true, change: false });
    expect(appels.some((x) => /^(INSERT|UPDATE)/.test(x.sql))).toBe(false);
    expect(await m.definirSocieteCompte(5, 'macj', '2026-11-01', A)).toEqual({ ok: true, change: true });
    expect(appels.filter((x) => x.sql.startsWith('UPDATE')).every((x) => x.sql.includes('retire_le = now()') && x.params[1] === '2026-11-01')).toBe(true);
    expect(appels.some((x) => /DELETE/i.test(x.sql))).toBe(false);
  });
  it('la société du jour et son historique', async () => {
    periodes = [{ id: '1', societe: 'criterimmo', depuis: '2000-01-01' }, { id: '2', societe: 'macj', depuis: '2026-11-01' }];
    expect((await m.lireSocieteCompte(5, '2026-10-27')).valeur).toBe('criterimmo');
    expect((await m.lireSocieteCompte(5, '2026-11-02')).valeur).toBe('macj');
    expect((await m.societesDesComptes([5], '2026-11-02')).get(5)).toBe('macj');
  });
});

describe('🔴 LOT K (438) — « CRITERIMMO et MACJ »', () => {
  it('sans la 438 : refusé avec le motif, rien n’est écrit', async () => {
    expect(await m.definirSocieteCompte(5, 'les_deux', '2026-10-28', A)).toEqual({ ok: false, motif: expect.stringMatching(/migration 438/) });
    expect(appels.filter((x) => /^(INSERT|UPDATE)/.test(x.sql))).toEqual([]);
  });
  it('avec la 438 : une période « les_deux », signée ; relue telle quelle (règle générique, aucun nom)', async () => {
    lotK.mockResolvedValue(true);
    expect(await m.definirSocieteCompte(5, 'les_deux', '2026-10-28', A)).toEqual({ ok: true, change: true });
    expect(appels.find((x) => x.sql.startsWith('INSERT INTO transaction_societe_compte'))!.params.slice(0, 2)).toEqual([5, 'les_deux']);
    periodes = [{ id: '1', societe: 'les_deux', depuis: '2026-10-28' }];
    const e = await m.lireSocieteCompte(5, '2026-10-28');
    expect([e.valeur, e.lesDeux]).toEqual(['les_deux', true]);
  });
});
