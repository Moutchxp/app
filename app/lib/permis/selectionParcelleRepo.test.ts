import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * PL-C2 — moteur de sélection (superposition). Tests UNITAIRES (db mockée, routée par fragment SQL) : on prouve la GARDE DURE
 * (jamais `permis_parcelle`), la PROVENANCE (valide_par = auteur réel), le SWAP ATOMIQUE, et le recompute. Le byte-identique et la
 * garde « sélection d'abord » sur rejeu sont prouvés en INTÉGRATION (selectionParcelleRepo.itest.ts, vraie base).
 */

const sqls: string[] = [];               // toutes les requêtes émises (SQL brut) — hors transaction
const txSqls: { sql: string; params: unknown[] }[] = []; // requêtes DANS le swap transactionnel

vi.mock('../db/client', () => ({
  query: vi.fn(async (sql: string) => { sqls.push(sql); return { rows: [], rowCount: 0 }; }),
  withTransaction: vi.fn(async (fn: (q: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>) => Promise<unknown>) =>
    fn(async (sql: string, params?: unknown[]) => { txSqls.push({ sql, params: params ?? [] }); return { rows: [], rowCount: 2 }; })),
}));
vi.mock('./parcellesRepo', () => ({
  figerEmpreinte: vi.fn(async () => ({ surfaceM2: 100, nbParcelles: 2, complete: true, motif: null, millesime: '2026-06-01', aGeometrie: true })),
  figerBatiSnapshot: vi.fn(async () => ({ capture: true, nbBatiments: 0, motif: null, sourceMillesime: null, batiments: [] })),
}));

import { validerSelection, retirerSelection } from './selectionParcelleRepo';
import { figerEmpreinte, figerBatiSnapshot } from './parcellesRepo';

beforeEach(() => { sqls.length = 0; txSqls.length = 0; vi.clearAllMocks(); });

const toutLeSql = () => [...sqls, ...txSqls.map((t) => t.sql)].join('\n').replace(/\s+/g, ' ');

describe('validerSelection — superposition, jamais permis_parcelle', () => {
  it('🔴 GARDE DURE : aucune écriture ne touche permis_parcelle (ni INTO, ni UPDATE, ni DELETE)', async () => {
    await validerSelection(468, ['75119000DI0649'], '2');
    const sql = toutLeSql();
    expect(sql).not.toMatch(/INTO permis_parcelle\b/);
    expect(sql).not.toMatch(/UPDATE permis_parcelle\b/);
    expect(sql).not.toMatch(/DELETE FROM permis_parcelle\b/);
    // ... et ça écrit BIEN dans la table de superposition, depuis `parcelle` (contour figé) :
    expect(sql).toContain('INSERT INTO permis_parcelle_selection');
    expect(sql).toContain('FROM parcelle par WHERE par.id = ANY');
    expect(sql).toContain('ST_Multi(ST_Force2D(par.geom))'); // geom_snapshot gelé à la validation
  });
  it('SWAP ATOMIQUE : DELETE de l’ancienne sélection PUIS INSERT, dans withTransaction', async () => {
    await validerSelection(468, ['75119000DI0649'], '2');
    expect(txSqls[0].sql).toContain('DELETE FROM permis_parcelle_selection');
    expect(txSqls[1].sql).toContain('INSERT INTO permis_parcelle_selection');
  });
  it('PROVENANCE : valide_par = l’auteur réel passé (jamais un harnais)', async () => {
    await validerSelection(468, ['75119000DI0649'], '2'); // '2' = id admin Arnaud Jorel
    const insert = txSqls.find((t) => t.sql.includes('INSERT INTO permis_parcelle_selection'));
    expect(insert?.params).toContain('2'); // le 3e param ($3 valide_par) = '2'
  });
  it('recompute APRÈS le swap : figerEmpreinte puis figerBatiSnapshot (même ordre qu’executerExtraction)', async () => {
    await validerSelection(468, ['75119000DI0649'], '2');
    expect(figerEmpreinte).toHaveBeenCalledWith(468, '2');
    expect(figerBatiSnapshot).toHaveBeenCalledWith(468, '2');
  });
  it('liste vide → 0 sélectionnée, aucun INSERT (juste le DELETE de nettoyage)', async () => {
    const r = await validerSelection(468, [], '2');
    expect(r.nbDemandees).toBe(0);
    expect(txSqls.some((t) => t.sql.includes('INSERT INTO permis_parcelle_selection'))).toBe(false);
    expect(txSqls.some((t) => t.sql.includes('DELETE FROM permis_parcelle_selection'))).toBe(true);
  });
});

describe('retirerSelection — DELETE seul puis recompute (retour à l’automatique)', () => {
  it('un DELETE de la sélection, PUIS figerEmpreinte (chemin automatique) — jamais permis_parcelle', async () => {
    await retirerSelection(468, '2');
    const sql = toutLeSql();
    expect(sql).toContain('DELETE FROM permis_parcelle_selection WHERE dossier_id');
    expect(sql).not.toMatch(/permis_parcelle\b(?!_selection)/); // aucune mention de permis_parcelle (hors _selection)
    expect(figerEmpreinte).toHaveBeenCalledWith(468, '2');
    expect(figerBatiSnapshot).toHaveBeenCalledWith(468, '2');
  });
});
