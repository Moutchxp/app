import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * N5-D/E — lecture du journal pour l'affichage. `db/client` mocké (une seule requête). On éprouve : le GROUPEMENT par (corps,
 * champ), l'accumulation des provenances (retenue), la reprise du MOTIF (ecartee), l'exclusion des lignes sans corps, et le fait
 * qu'on ne demande QUE les 'retenue'/'ecartee' du dossier lié (fragment sémantique + paramètre LIÉ, jamais la forme exacte du SQL).
 */
const H = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  const state = { rows: [] as Record<string, unknown>[] };
  const queryMock = async (sql: string, params?: unknown[]) => { appels.push({ sql, params: params ?? [] }); return { rows: state.rows }; };
  return { appels, state, queryMock };
});
vi.mock('../db/client', () => ({ query: H.queryMock }));

import { lireJournalChamps } from './journalLecture';

beforeEach(() => { H.appels.length = 0; H.state.rows = []; });

describe('lireJournalChamps', () => {
  it('champ RETENU : groupe, accumule les provenances, garde la première confiance/réserve non nulle', async () => {
    H.state.rows = [
      { corps_id: 42, champ: 'altitude_sommet_ngf', role: 'retenue', confiance: 'a_verifier', reserve: 'voisin possible', motif: null, piece: 'PC3.pdf', page: 2 },
      { corps_id: 42, champ: 'altitude_sommet_ngf', role: 'retenue', confiance: 'a_verifier', reserve: 'voisin possible', motif: null, piece: 'PC5.pdf', page: 4 },
    ];
    const j = await lireJournalChamps(7);
    expect(j[42].altitude_sommet_ngf.confiance).toBe('a_verifier');
    expect(j[42].altitude_sommet_ngf.reserve).toBe('voisin possible');
    expect(j[42].altitude_sommet_ngf.provenances).toEqual([{ piece: 'PC3.pdf', page: 2 }, { piece: 'PC5.pdf', page: 4 }]);
    expect(j[42].altitude_sommet_ngf.motif).toBeNull();
  });

  it('champ ÉCARTÉ : porte le MOTIF, aucune provenance', async () => {
    H.state.rows = [
      { corps_id: 42, champ: 'hauteur_relative_m', role: 'ecartee', confiance: null, reserve: null, motif: 'aucun candidat trouvé dans le corpus', piece: null, page: null },
    ];
    const j = await lireJournalChamps(7);
    expect(j[42].hauteur_relative_m.motif).toBe('aucun candidat trouvé dans le corpus');
    expect(j[42].hauteur_relative_m.provenances).toEqual([]);
    expect(j[42].hauteur_relative_m.confiance).toBeNull();
  });

  it('ignore les lignes sans corps (corps_id null)', async () => {
    H.state.rows = [{ corps_id: null, champ: 'parking', role: 'ecartee', confiance: null, reserve: null, motif: 'x', piece: null, page: null }];
    expect(await lireJournalChamps(7)).toEqual({});
  });

  it('aucune ligne → objet vide', async () => {
    expect(await lireJournalChamps(7)).toEqual({});
  });

  it("ne demande que les 'retenue'/'ecartee' du dossier lié", async () => {
    await lireJournalChamps(7);
    const sql = H.appels[0].sql.replace(/\s+/g, ' ');
    expect(sql).toContain("role IN ('retenue', 'ecartee')");
    expect(sql).toContain('permis_extraction_journal');
    expect(H.appels[0].params).toEqual([7]);
  });
});
