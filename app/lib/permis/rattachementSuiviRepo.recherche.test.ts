import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * rechercherSuivi — FILTRAGE EN BASE + pagination. On teste le COMPORTEMENT (résultats, total du filtre, pages, PARAMÈTRES LIÉS) et le
 * SQL par FRAGMENTS sémantiques whitespace-normalisés (jamais la forme exacte d'un WHERE complet). `db/client` mocké, aucune connexion.
 */
const H = vi.hoisted(() => {
  const calls: { sql: string; params: unknown[] }[] = [];
  const query = async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params: params ?? [] });
    // La requête principale (paginée) porte `count(*) OVER()` → une rangée LigneSuivi complète + total (bigint pg → chaîne).
    if (/count\(\*\) OVER\(\)/i.test(sql)) {
      return { rows: [{
        dossier_id: '7424', num_dau: '0930012500081', code_insee: '93001', commune: 'Aubervilliers', type: 'PC', adresse: null,
        nature: '1', ratt_etat: null, verdict: null, origine_ouverture: null, jours: 0, reevalue: null,
        date_autorisation: '2026-06-01', date_declenchement: null, projection_validee: false, nb_corps: 0, nb_corps_sans_alt: 0,
        total: '3', // count OVER : bigint → chaîne
      }] };
    }
    return { rows: [] }; // alertes de surveillance + complétude → vides (résilient)
  };
  return { calls, query };
});
vi.mock('../db/client', () => ({ query: H.query, withTransaction: async (fn: (q: unknown) => unknown) => fn(H.query), pool: {}, closePool: async () => undefined }));

import { rechercherSuivi } from './rattachementSuiviRepo';

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const requetePrincipale = () => H.calls.find((c) => /count\(\*\) OVER\(\)/i.test(c.sql))!;
beforeEach(() => { H.calls.length = 0; });

describe('rechercherSuivi — filtre paramétré + pagination', () => {
  it('un critère → SQL filtré (fragment + LIMIT/OFFSET + count OVER), paramètre LIÉ, résultat mappé', async () => {
    const r = await rechercherSuivi({ numDau: '0930012500081' }, 1);
    expect(r.lignes).toHaveLength(1);
    expect(r.lignes[0].dossierId).toBe(7424);          // bigint pg (chaîne) → NOMBRE
    expect(r.total).toBe(3);                            // count OVER (chaîne) → NOMBRE
    expect(r.page).toBe(1);
    expect(r.nbPages).toBe(1);                          // ceil(3 / 20)
    const q = norm(requetePrincipale().sql);
    expect(q).toContain('count(*) OVER() AS total');    // total du filtre EN COURS
    expect(q).toContain('WHERE s.num_dau ILIKE');       // fragment de filtre appliqué EN BASE
    expect(q).toContain('LIMIT 20 OFFSET 0');           // page 1
    expect(requetePrincipale().params).toEqual(['0930012500081']); // valeur LIÉE, jamais concaténée
  });

  it('pagination : page 3 → OFFSET 40 (stable, ORDER BY en base)', async () => {
    await rechercherSuivi({ type: 'pd' }, 3);
    const q = norm(requetePrincipale().sql);
    expect(q).toContain('LIMIT 20 OFFSET 40');
    expect(q).toContain('ORDER BY s.date_reelle_autorisation DESC NULLS LAST, e.dossier_id');
  });

  it('aucun critère (inactif) → résultat vide SANS émettre la requête principale (le défaut listerSuivi est ailleurs)', async () => {
    const r = await rechercherSuivi({}, 1);
    expect(r).toEqual({ lignes: [], total: 0, page: 1, nbPages: 0 });
    expect(H.calls.some((c) => /count\(\*\) OVER\(\)/i.test(c.sql))).toBe(false);
  });
});
