import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * NOM-1 — attribuerNomsRepli : pose « BP{rang} » (ou « BP » pour un permis à un seul corps) sur les corps SANS repere ET SANS
 * nom_repli, par ordre `id`. Stabilité : un nom déjà posé n'est pas recalculé (garde `nom_repli IS NULL`). Résilience : colonne
 * absente (42703) → no-op. `db/client` mocké ; on inspecte les UPDATE émis.
 */
const H = vi.hoisted(() => {
  const calls: { sql: string; params: unknown[] }[] = [];
  const state = { rows: [] as { id: number; repere: string | null; nom_repli: string | null }[], selectThrows: false };
  const queryMock = async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (/SELECT id::int AS id, repere, nom_repli FROM permis_corps_batiment/i.test(sql)) {
      if (state.selectThrows) { const e = new Error('col') as Error & { code: string }; e.code = '42703'; throw e; }
      return { rows: state.rows };
    }
    return { rows: [], rowCount: 1 };
  };
  return { calls, state, queryMock };
});
vi.mock('../db/client', () => ({ query: H.queryMock }));

import { attribuerNomsRepli } from './caracteristiquesRepo';

const updates = () => H.calls.filter((c) => /UPDATE permis_corps_batiment SET nom_repli/i.test(c.sql)).map((c) => c.params);

describe('NOM-1 — attribuerNomsRepli', () => {
  beforeEach(() => { H.calls.length = 0; H.state.rows = []; H.state.selectThrows = false; });

  it('permis à UN SEUL corps anonyme → pose « BP » (sans numéro)', async () => {
    H.state.rows = [{ id: 3, repere: null, nom_repli: null }];
    await attribuerNomsRepli(11430);
    expect(updates()).toEqual([[3, 'BP']]);
  });

  it('le rang suit le CORPS : corps 1 nommé « BAT A », corps 2 anonyme → seul le corps 2 reçoit « BP2 » (jamais BP1)', async () => {
    H.state.rows = [{ id: 5, repere: 'BAT A', nom_repli: null }, { id: 8, repere: null, nom_repli: null }];
    await attribuerNomsRepli(1);
    expect(updates()).toEqual([[8, 'BP2']]); // corps 1 (nommé) intouché ; corps 2 → BP2
  });

  it('un nom déjà attribué n’est PAS recalculé (stabilité)', async () => {
    H.state.rows = [{ id: 3, repere: null, nom_repli: 'BP' }, { id: 4, repere: null, nom_repli: null }];
    await attribuerNomsRepli(1);
    expect(updates()).toEqual([[4, 'BP2']]); // seul le corps 4 (sans nom) est écrit ; le corps 3 garde son 'BP'
  });

  it('deux corps anonymes → BP1 puis BP2 (ordre id)', async () => {
    H.state.rows = [{ id: 3, repere: null, nom_repli: null }, { id: 7, repere: null, nom_repli: null }];
    await attribuerNomsRepli(1);
    expect(updates()).toEqual([[3, 'BP1'], [7, 'BP2']]);
  });

  it('colonne absente (migration 168 non appliquée) → aucun crash, aucun UPDATE', async () => {
    H.state.selectThrows = true;
    await expect(attribuerNomsRepli(1)).resolves.toBeUndefined();
    expect(updates()).toEqual([]);
  });
});
