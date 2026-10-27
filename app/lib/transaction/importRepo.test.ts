import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Plan, VentePlan } from './planImport';

/**
 * 🔴 TUILE « TRANSACTION », LOT B — l'écriture, base simulée : idempotente (une clé déjà là n'est pas réécrite), marquée, une saisie
 * d'Arno jamais écrasée, `--annuler` qui RETIRE (jamais DELETE) les seules lignes de l'import. (Éprouvé aussi sur la base jetable.)
 */
const appels: { sql: string; params: unknown[] }[] = [];
let reponse: (sql: string) => Record<string, unknown>[] = () => [];
const q = vi.fn(async (sql: string, params: unknown[] = []) => { const s = sql.replace(/\s+/g, ' '); appels.push({ sql: s, params }); return { rows: reponse(s) }; });
vi.mock('../db/client', () => ({ query: (s: string, p: unknown[]) => q(s, p), withTransaction: async (fn: (x: typeof q) => unknown) => fn(q) }));
const repo = await import('./importRepo');

const occ = { cle: 'F.xlsx|CEDRIC|10', fichier: 'F.xlsx', societe: 'criterimmo' as const, annee: 2025, onglet: 'CEDRIC', ligne: 10, libelle: 'X', montant: 1000, paye: null,
  deuxMontants: false, nature: 'vente' as const, sorte: 'comptee' as const, mois: [2], requalifie: false };
const vente: VentePlan = { cle: occ.cle, societe: 'criterimmo', fichier: 'F.xlsx', annee: 2025, libelle: 'X', honorairesTtc: 1000, statut: 'vendue', mois: 2, motifMois: null,
  primaire: occ, lignes: [{ occ, role: 'vendeur', montantTtc: null, compte: true, note: null }], notes: [] };
const plan = (): Plan => ({ ventes: [vente], retros: [], aRattacher: [], destins: new Map(), rapports: [], interSocietes: [],
  gestion: [{ cle: 'F.xlsx|GESTION|1', fichier: 'F.xlsx', annee: 2025, mois: 1, nbLots: null, honorairesHt: 14127, adhocHt: 6437, salarieHt: null, resteHt: 7690, note: null }] });
beforeEach(() => { appels.length = 0; reponse = () => []; });

describe('écrire un fichier', () => {
  it('crée la vente, sa ligne et le mois de gestion, marqués ; le journal garde la source', async () => {
    reponse = (s) => (s.includes('information_schema.tables') ? [{ n: 1 }] : s.startsWith('INSERT') && s.includes('RETURNING id') ? [{ id: '7' }] : []);
    const b = await repo.ecrireFichier(plan(), 'F.xlsx', 'import fichier transaction du 27/10');
    expect(b).toMatchObject({ ventesCreees: 1, lignes: 1, gestion: 1 });
    const v = appels.find((a) => a.sql.startsWith('INSERT INTO transaction_vente ('))!;
    expect(v.params).toEqual(['criterimmo', 'X', 1000, 'vendue', 2025, '2025-02-01', null, 'import fichier transaction du 27/10', 'F.xlsx|CEDRIC|10', 'F.xlsx', 'CEDRIC', 10]);
  });
  it('rejouer n’écrit rien : les clés sont déjà là (idempotent)', async () => {
    reponse = (s) => {
      if (s.includes('information_schema.tables')) return [{ n: 1 }];
      if (s.startsWith('SELECT id, import_cle FROM transaction_vente')) return [{ id: '7', import_cle: 'F.xlsx|CEDRIC|10' }];
      if (s.startsWith('SELECT vente_id, import_cle')) return [{ vente_id: '7', import_cle: 'F.xlsx|CEDRIC|10' }];
      if (s.startsWith('SELECT annee, mois, origine')) return [{ annee: 2025, mois: 1, origine: 'import', import_cle: 'F.xlsx|GESTION|1', retire: false }];
      if (s.includes('FOR UPDATE')) return [{ honoraires_ttc: '1000', statut: 'vendue', annee: 2025, mois_acte: '2025-02-01' }];
      return [];
    };
    const b = await repo.ecrireFichier(plan(), 'F.xlsx', 'm');
    expect(b).toMatchObject({ ventesCreees: 0, ventesMisesAJour: 0, lignes: 0, gestion: 0 });
    expect(appels.some((a) => a.sql.startsWith('INSERT') || a.sql.startsWith('UPDATE'))).toBe(false);
  });
  it('un mois de gestion déjà saisi à l’écran n’est jamais écrasé', async () => {
    reponse = (s) => (s.includes('information_schema.tables') ? [{ n: 1 }] : s.startsWith('SELECT annee, mois, origine')
      ? [{ annee: 2025, mois: 1, origine: 'saisie', import_cle: null, retire: false }] : s.includes('RETURNING id') ? [{ id: '7' }] : []);
    const b = await repo.ecrireFichier(plan(), 'F.xlsx', 'm');
    expect(b.gestion).toBe(0);
    expect(b.gestionLaissee[0]).toMatch(/déjà en base \(saisie\)/);
  });
});

describe('--annuler et --retablir', () => {
  it('ne vise que les lignes de l’import (origine, marque), les retire sans jamais supprimer', async () => {
    reponse = (s) => (s.includes('information_schema.tables') ? [{ n: 1 }] : s.startsWith('SELECT id FROM') ? [{ id: '3' }] : []);
    const c = await repo.annulerImport(['F.xlsx'], 'import fichier transaction du 28/10', true);
    expect(c.transaction_vente).toBe(1);
    const sel = appels.find((a) => a.sql.startsWith('SELECT id FROM transaction_vente '))!;
    expect(sel.sql).toContain("origine = 'import'");
    expect(sel.params).toEqual(['import fichier transaction%', ['F.xlsx']]);
    expect(appels.some((a) => a.sql.startsWith('UPDATE transaction_vente SET retire_le = now()'))).toBe(true);
  });
  it('à blanc, rien n’est écrit ; et le dépôt n’émet jamais DELETE ni TRUNCATE', async () => {
    reponse = (s) => (s.includes('information_schema.tables') ? [{ n: 1 }] : s.startsWith('SELECT id') ? [{ id: '3', annee: null, mois: null }] : []);
    await repo.annulerImport(null, 'm', false);
    await repo.retablirImport(null, 'm', false);
    expect(appels.some((a) => a.sql.startsWith('UPDATE') || a.sql.startsWith('INSERT'))).toBe(false);
    const src = readFileSync('app/lib/transaction/importRepo.ts', 'utf8');
    expect(src).not.toMatch(/\bDELETE\s+FROM\b|\bTRUNCATE\b/i);
  });
});
