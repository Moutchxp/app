import { describe, it, expect, vi } from 'vitest';
import { mesurerMorphologie, type RequeteMorpho } from './morphologieRepo';

/**
 * FRAÎCHEUR / F4 — mesure disque (repo). On teste le COMPORTEMENT (nombres bien typés, deux requêtes émises, sentinelle
 * d'échec = null + log), PAS la forme littérale du SQL. Vérif SQL uniquement par FRAGMENTS sémantiques whitespace-normalisés.
 */

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('mesurerMorphologie — succès', () => {
  it('mappe les tailles en NOMBRES et lit pg_database_size', async () => {
    const requetes: string[] = [];
    const q: RequeteMorpho = (async (text: string) => {
      requetes.push(text);
      if (text.includes('pg_database_size')) return { rows: [{ db: '2400' }] };
      return { rows: [{ table: 'batiment', total: '1000', donnees: '800', idx: '200', lignes: '3000000' }] };
    }) as RequeteMorpho;

    const res = await mesurerMorphologie(q);
    expect(res).not.toBeNull();
    expect(res!.dbTotal).toBe(2400);
    expect(res!.tables[0]).toEqual({ table: 'batiment', total: 1000, donnees: 800, index: 200, lignes: 3_000_000 });
    // Fragments sémantiques (chaîne normalisée), jamais la forme exacte du WHERE :
    const sqls = requetes.map(norm);
    expect(sqls.some((s) => s.includes('pg_total_relation_size(c.oid)') && s.includes("nspname = 'public'"))).toBe(true);
    expect(sqls.some((s) => s.includes('pg_database_size(current_database())'))).toBe(true);
  });
});

describe('mesurerMorphologie — sentinelle d’échec', () => {
  it('une erreur pg → null (jamais des zéros), et l’erreur est journalisée (pas de catch muet)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const q: RequeteMorpho = (async () => { throw new Error('FATAL: connexion perdue'); }) as RequeteMorpho;
    const res = await mesurerMorphologie(q);
    expect(res).toBeNull();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
