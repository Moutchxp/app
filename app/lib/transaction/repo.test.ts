import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TUILE « TRANSACTION » — la base, simulée : sans la migration 433 RIEN ne s'écrit ; rien n'est jamais supprimé ; une modification
 * journalise seulement ce qui change ; « Annuler » refuse un geste dépassé par un plus récent. (Éprouvé aussi sur la base jetable.)
 */
const disponible = vi.fn<() => Promise<boolean>>();
vi.mock('../admin/schemaDroits', () => ({ droitTransactionDisponible: () => disponible() }));
const appels: { sql: string; params: unknown[] }[] = [];
let reponses: ((sql: string) => { rows: Record<string, unknown>[] } | undefined)[] = [];
const q = vi.fn(async (sql: string, params: unknown[] = []) => {
  appels.push({ sql: sql.replace(/\s+/g, ' '), params });
  for (const r of reponses) { const x = r(sql.replace(/\s+/g, ' ')); if (x !== undefined) return x; }
  return { rows: [] };
});
vi.mock('../db/client', () => ({ query: (s: string, p: unknown[]) => q(s, p), withTransaction: async (fn: (x: typeof q) => unknown) => fn(q) }));

const repo = await import('./repo');
const A = { id: 3, libelle: 'arno' };
beforeEach(() => { appels.length = 0; reponses = []; disponible.mockResolvedValue(true); q.mockClear(); });

describe('sans la migration 433', () => {
  it('toute écriture est refusée avec le motif, sans une requête', async () => {
    disponible.mockResolvedValue(false);
    expect(await repo.modifierVente(1, { mois: 2 }, A)).toEqual({ ok: false, motif: repo.MOTIF_SANS_MIGRATION });
    expect(await repo.rattacherRetro(1, 2, A)).toEqual({ ok: false, motif: repo.MOTIF_SANS_MIGRATION });
    expect(await repo.enregistrerGestion(2025, 1, { nbLots: null, honorairesHt: 1, adhocHt: null, salarieHt: null, resteHt: null, note: null }, A))
      .toEqual({ ok: false, motif: repo.MOTIF_SANS_MIGRATION });
    expect(appels).toEqual([]);
  });
});

describe('rien n’est jamais supprimé', () => {
  it('le dépôt n’émet aucun DELETE ni TRUNCATE', () => {
    const src = readFileSync('app/lib/transaction/repo.ts', 'utf8');
    expect(src).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(src).not.toMatch(/\bTRUNCATE\b/i);
  });
});

describe('modifier une vente', () => {
  it('écrit et journalise SEULEMENT les champs qui changent (valeur avant / après)', async () => {
    reponses.push((s) => (s.includes('FROM transaction_vente WHERE id = $1 FOR UPDATE')
      ? { rows: [{ libelle: 'A', honoraires_ttc: '12000', statut: 'vendue', annee: 2025, mois_acte: '2025-03-01', date_compromis: null, apporteur: null, note: null, retire_le: null }] } : undefined));
    reponses.push((s) => (s.startsWith('INSERT INTO transaction_journal') ? { rows: [{ id: '9' }] } : undefined));
    expect(await repo.modifierVente(5, { mois: 4, libelle: 'A' }, A)).toEqual({ ok: true });
    const maj = appels.find((x) => x.sql.startsWith('UPDATE transaction_vente'))!;
    expect(maj.sql).toContain('mois_acte = $2');
    expect(maj.sql).not.toContain('libelle');
    expect(maj.params).toEqual([5, '2025-04-01']);
    const j = appels.find((x) => x.sql.startsWith('INSERT INTO transaction_journal'))!;
    expect(j.params.slice(0, 5)).toEqual(['vente', 5, 'modification', JSON.stringify({ mois_acte: '2025-03-01' }), JSON.stringify({ mois_acte: '2025-04-01' })]);
  });
  it('un compromis n’a pas de mois de l’acte', async () => {
    reponses.push((s) => (s.includes('FOR UPDATE') ? { rows: [{ libelle: 'A', honoraires_ttc: 1, statut: 'vendue', annee: 2025, mois_acte: '2025-03-01', date_compromis: null, apporteur: null, note: null, retire_le: null }] } : undefined));
    reponses.push((s) => (s.startsWith('INSERT INTO transaction_journal') ? { rows: [{ id: '9' }] } : undefined));
    await repo.modifierVente(5, { statut: 'compromis' }, A);
    expect(appels.find((x) => x.sql.startsWith('UPDATE transaction_vente'))!.params).toEqual([5, 'compromis', null]);
  });
});

describe('annuler un geste', () => {
  it('refuse quand la ligne a été modifiée depuis par un geste plus récent', async () => {
    reponses.push((s) => (s.includes('FROM transaction_journal j WHERE id = $1')
      ? { rows: [{ id: '7', entite: 'retrocession', entite_id: '4', action: 'rattachement', avant: { vente_id: null }, apres: { vente_id: 10 }, deja: false }] } : undefined));
    reponses.push((s) => (s.includes('FROM transaction_retrocession WHERE id = $1 FOR UPDATE') ? { rows: [{ vente_id: '11', apporteur: null, montant_ttc: '1200', retire_le: null }] } : undefined));
    const r = await repo.annulerGeste(7, A);
    expect(r.ok).toBe(false);
    expect(appels.some((x) => x.sql.startsWith('UPDATE'))).toBe(false);
  });
  it('une MISE À JOUR par l’import (compromis devenu vente, D2) s’annule en remettant la valeur d’avant — jamais en retirant la vente', async () => {
    reponses.push((s) => (s.includes('FROM transaction_journal j WHERE id = $1')
      ? { rows: [{ id: '5', entite: 'vente', entite_id: '18', action: 'import_mise_a_jour', avant: { statut: 'compromis', annee: 2025 }, apres: { statut: 'vendue', annee: 2026 }, deja: false }] } : undefined));
    reponses.push((s) => (s.includes('FROM transaction_vente WHERE id = $1 FOR UPDATE')
      ? { rows: [{ libelle: 'OURY/BERTRAND', honoraires_ttc: '50000', statut: 'vendue', annee: 2026, mois_acte: '2026-02-01', date_compromis: null, apporteur: null, note: null, retire_le: null }] } : undefined));
    reponses.push((s) => (s.startsWith('INSERT INTO transaction_journal') ? { rows: [{ id: '6' }] } : undefined));
    expect(await repo.annulerGeste(5, A)).toEqual({ ok: true });
    const maj = appels.find((x) => x.sql.startsWith('UPDATE transaction_vente'))!;
    expect(maj.sql).not.toContain('retire_le');
    expect(maj.params.slice(1)).toEqual(['compromis', 2025]);
  });
  it('remet la valeur d’avant et journalise l’annulation (annule_journal_id)', async () => {
    reponses.push((s) => (s.includes('FROM transaction_journal j WHERE id = $1')
      ? { rows: [{ id: '7', entite: 'retrocession', entite_id: '4', action: 'rattachement', avant: { vente_id: null }, apres: { vente_id: 10 }, deja: false }] } : undefined));
    reponses.push((s) => (s.includes('FROM transaction_retrocession WHERE id = $1 FOR UPDATE') ? { rows: [{ vente_id: '10', apporteur: null, montant_ttc: '1200', retire_le: null }] } : undefined));
    reponses.push((s) => (s.startsWith('INSERT INTO transaction_journal') ? { rows: [{ id: '8' }] } : undefined));
    expect(await repo.annulerGeste(7, A)).toEqual({ ok: true });
    expect(appels.find((x) => x.sql.startsWith('UPDATE transaction_retrocession'))!.params).toEqual([4, null]);
    const j = appels.find((x) => x.sql.startsWith('INSERT INTO transaction_journal'))!;
    expect(j.params[2]).toBe('annulation');
    expect(j.params[6]).toBe(7);
  });
});

describe('LOT C — attribuer une vente notée chez les deux sociétés', () => {
  const notesEnBase = (s: string) => (s.includes('WHERE double_cle = $1') ? { rows: [{ id: '1', societe: 'criterimmo' }, { id: '2', societe: 'macj' }] } : undefined);
  const etat: Record<string, string> = { '1': 'a_attribuer', '2': 'a_attribuer' };
  it('« Attribuer à MACJ » : MACJ retenue, CRITERIMMO écartée, chaque note journalisée ; « Remettre à attribuer » défait', async () => {
    reponses.push(notesEnBase);
    reponses.push((s) => (s.includes('FROM transaction_vente WHERE id = $1 FOR UPDATE') ? { rows: [{ libelle: 'X', honoraires_ttc: '1', statut: 'vendue', annee: 2025, mois_acte: null,
      date_compromis: null, apporteur: null, note: null, retire_le: null, attribution: etat[String(appels.at(-1)!.params[0])] }] } : undefined));
    reponses.push((s) => (s.startsWith('INSERT INTO transaction_journal') ? { rows: [{ id: '9' }] } : undefined));
    expect(await repo.attribuer('double|X', 'macj', A)).toEqual({ ok: true });
    const majs = appels.filter((x) => x.sql.startsWith('UPDATE transaction_vente'));
    expect(majs.map((x) => x.params)).toEqual([[1, 'ecartee'], [2, 'retenue']]);
    expect(appels.filter((x) => x.sql.startsWith('INSERT INTO transaction_journal')).map((x) => x.params[2])).toEqual(['attribution', 'attribution']);
    appels.length = 0; etat['1'] = 'ecartee'; etat['2'] = 'retenue';
    expect(await repo.attribuer('double|X', null, A)).toEqual({ ok: true });
    expect(appels.filter((x) => x.sql.startsWith('UPDATE transaction_vente')).map((x) => x.params)).toEqual([[1, 'a_attribuer'], [2, 'a_attribuer']]);
  });
  it('une société qui n’a pas noté la vente est refusée', async () => {
    reponses.push((s) => (s.includes('WHERE double_cle = $1') ? { rows: [{ id: '1', societe: 'criterimmo' }] } : undefined));
    expect((await repo.attribuer('double|X', 'macj', A)).ok).toBe(false);
  });
});
