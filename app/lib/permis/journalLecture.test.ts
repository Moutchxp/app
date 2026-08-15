import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * N5-D — lecture du journal pour l'affichage. `db/client` mocké (une seule requête). On éprouve : le GROUPEMENT par (corps, champ),
 * l'accumulation des provenances, la confiance/réserve retenues (première non nulle), l'exclusion des lignes sans corps, et le fait
 * qu'on ne demande QUE les 'retenue' du dossier lié (fragment sémantique + paramètre LIÉ, jamais la forme exacte du SQL).
 */
const H = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  const state = { rows: [] as Record<string, unknown>[] };
  const queryMock = async (sql: string, params?: unknown[]) => { appels.push({ sql, params: params ?? [] }); return { rows: state.rows }; };
  return { appels, state, queryMock };
});
vi.mock('../db/client', () => ({ query: H.queryMock }));

import { lireJournalRetenu } from './journalLecture';

beforeEach(() => { H.appels.length = 0; H.state.rows = []; });

describe('lireJournalRetenu', () => {
  it('groupe par (corps, champ), accumule les provenances, garde la première confiance/réserve non nulle', async () => {
    H.state.rows = [
      { corps_id: 42, champ: 'altitude_sommet_ngf', confiance: 'a_verifier', reserve: 'voisin possible', piece: 'PC3.pdf', page: 2 },
      { corps_id: 42, champ: 'altitude_sommet_ngf', confiance: 'a_verifier', reserve: 'voisin possible', piece: 'PC5.pdf', page: 4 },
      { corps_id: 42, champ: 'niveau_fini', confiance: null, reserve: null, piece: 'PC3.pdf', page: 2 },
    ];
    const j = await lireJournalRetenu(7);
    expect(j[42].altitude_sommet_ngf.confiance).toBe('a_verifier');
    expect(j[42].altitude_sommet_ngf.reserve).toBe('voisin possible');
    expect(j[42].altitude_sommet_ngf.provenances).toEqual([{ piece: 'PC3.pdf', page: 2 }, { piece: 'PC5.pdf', page: 4 }]);
    expect(j[42].niveau_fini.confiance).toBeNull();
  });

  it('ignore les lignes sans corps (corps_id null)', async () => {
    H.state.rows = [{ corps_id: null, champ: 'altitude_sommet_ngf', confiance: 'a_verifier', reserve: 'x', piece: 'PC.pdf', page: 1 }];
    expect(await lireJournalRetenu(7)).toEqual({});
  });

  it('aucune ligne → objet vide', async () => {
    expect(await lireJournalRetenu(7)).toEqual({});
  });

  it("ne demande que les 'retenue' du dossier lié", async () => {
    await lireJournalRetenu(7);
    const sql = H.appels[0].sql.replace(/\s+/g, ' ');
    expect(sql).toContain("role = 'retenue'");
    expect(sql).toContain('permis_extraction_journal');
    expect(H.appels[0].params).toEqual([7]);
  });
});
