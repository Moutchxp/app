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
    expect(j.parCorps[42].altitude_sommet_ngf.confiance).toBe('a_verifier');
    expect(j.parCorps[42].altitude_sommet_ngf.reserve).toBe('voisin possible');
    expect(j.parCorps[42].altitude_sommet_ngf.provenances).toEqual([{ piece: 'PC3.pdf', page: 2 }, { piece: 'PC5.pdf', page: 4 }]);
    expect(j.parCorps[42].altitude_sommet_ngf.motif).toBeNull();
  });

  it('champ ÉCARTÉ : porte le MOTIF, aucune provenance', async () => {
    H.state.rows = [
      { corps_id: 42, champ: 'hauteur_relative_m', role: 'ecartee', confiance: null, reserve: null, motif: 'aucun candidat trouvé dans le corpus', piece: null, page: null },
    ];
    const j = await lireJournalChamps(7);
    expect(j.parCorps[42].hauteur_relative_m.motif).toBe('aucun candidat trouvé dans le corpus');
    expect(j.parCorps[42].hauteur_relative_m.provenances).toEqual([]);
    expect(j.parCorps[42].hauteur_relative_m.confiance).toBeNull();
  });

  it('N7-E — les lignes sans corps (corps_id null) vont au niveau PERMIS (plus perdues)', async () => {
    H.state.rows = [
      { corps_id: null, champ: 'surface_plancher_m2', role: 'retenue', confiance: 'confirmee', reserve: null, motif: null, piece: 'cerfa.pdf', page: 4 },
      { corps_id: null, champ: 'nb_logements', role: 'ecartee', confiance: null, reserve: null, motif: 'absence ≠ zéro', piece: null, page: null },
    ];
    const j = await lireJournalChamps(7);
    expect(j.permis.surface_plancher_m2.confiance).toBe('confirmee');
    expect(j.permis.nb_logements.motif).toBe('absence ≠ zéro');
    expect(j.parCorps).toEqual({});
  });

  it('N10-C — expose la METHODE (liste fermée) : première non nulle par champ ; sert à détecter « Cerfa scan »', async () => {
    H.state.rows = [
      { corps_id: null, champ: 'surface_plancher_m2', role: 'ecartee', confiance: null, reserve: null, motif: 'champ absent du Cerfa', piece: null, page: null, valeur: null, methode: 'cerfa' },
      { corps_id: 42, champ: 'altitude_sommet_ngf', role: 'retenue', confiance: 'confirmee', reserve: null, motif: null, piece: 'PC3.pdf', page: 1, valeur: 97.13, methode: 'enonce' },
    ];
    const j = await lireJournalChamps(7);
    expect(j.permis.surface_plancher_m2.methode).toBe('cerfa'); // niveau permis → détection scan
    expect(j.parCorps[42].altitude_sommet_ngf.methode).toBe('enonce');
  });

  it('aucune ligne → parCorps et permis vides', async () => {
    expect(await lireJournalChamps(7)).toEqual({ parCorps: {}, permis: {} });
  });

  it("ne demande que les 'retenue'/'ecartee' du dossier lié", async () => {
    await lireJournalChamps(7);
    const sql = H.appels[0].sql.replace(/\s+/g, ' ');
    expect(sql).toContain("role IN ('retenue', 'ecartee')");
    expect(sql).toContain('permis_extraction_journal');
    expect(H.appels[0].params).toEqual([7]);
  });
});
