import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Q2b — lireDetailPermisCommune (panneau de détail). On mocke ../db/client et on route la requête de détail par son fragment
 * `LEFT JOIN LATERAL`. On PROUVE : (1) le FILTRE par type ne garde que la catégorie demandée (via `classer`, source unique) ;
 * (2) un permis déjà demandé est signalé AVEC la référence de la demande active, sinon « à demander » (null) ; (3) la PÉRIODE
 * par défaut (clé absente → 6 mois) émet bien une borne de date liée, tandis que « origine » n'en émet aucune (tout l'historique).
 */
const H = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  const state = { detailRows: [] as Record<string, unknown>[] };
  const queryMock = async (sql: string, params?: unknown[]) => {
    appels.push({ sql, params: params ?? [] });
    if (sql.includes('LEFT JOIN LATERAL')) return { rows: state.detailRows };
    return { rows: [] }; // config_veille + sous-lectures → replis par défaut (seuils 10/1500, rangs 1..5)
  };
  return { appels, state, queryMock };
});
vi.mock('../db/client', () => ({ query: H.queryMock, withTransaction: async () => undefined, pool: {}, closePool: async () => undefined }));

import { lireDetailPermisCommune, paramsLot } from './demandeRepo';
import { chargerConfigVeille, type ConfigVeille } from './veilleConfig';

// Lignes SQL brutes (forme renvoyée par la requête de détail).
const immeuble = (over: Record<string, unknown> = {}) => ({
  type: 'PC', num_dau: 'PC075056A0001', date: '2026-05-01', nature_projet_completee: '1',
  i_extension: false, i_surelevation: false, nb_lgt_tot_crees: 20, surf_creee: 2000,
  adr_num_ter: '10', adr_libvoie_ter: 'RUE DE PARIS', adr_localite_ter: 'Paris', demande_reference: null, ...over,
});
const extension = (over: Record<string, unknown> = {}) => ({
  type: 'PC', num_dau: 'PC075056A0002', date: '2026-04-01', nature_projet_completee: null,
  i_extension: true, i_surelevation: false, nb_lgt_tot_crees: 1, surf_creee: 30,
  adr_num_ter: '2', adr_libvoie_ter: 'RUE B', adr_localite_ter: 'Paris', demande_reference: null, ...over,
});

const detailQuery = () => H.appels.find((a) => a.sql.includes('LEFT JOIN LATERAL'))!;

beforeEach(() => { H.appels.length = 0; H.state.detailRows = []; });

describe('Q2b — lireDetailPermisCommune : filtre par type (via classer)', () => {
  it('type = immeuble_neuf → ne garde que l’immeuble (l’extension est écartée)', async () => {
    const cfg = await chargerConfigVeille();
    H.state.detailRows = [immeuble(), extension()];
    const r = await lireDetailPermisCommune(cfg, '75056', '6m', 'immeuble_neuf');
    expect(r).toHaveLength(1);
    expect(r[0].categorie).toBe('immeuble_neuf');
    expect(r[0].numDau).toBe('PC075056A0001');
    expect(r[0].adresse).toBe('10 RUE DE PARIS Paris');
  });

  it('type = null (tous) → garde toutes les catégories', async () => {
    const cfg = await chargerConfigVeille();
    H.state.detailRows = [immeuble(), extension()];
    const r = await lireDetailPermisCommune(cfg, '75056', '6m', null);
    expect(r.map((p) => p.categorie)).toEqual(['immeuble_neuf', 'extension']);
  });
});

describe('Q2b — lireDetailPermisCommune : drapeau « déjà demandé »', () => {
  it('un permis rattaché à une demande active → demandeReference = sa référence ; sinon null', async () => {
    const cfg = await chargerConfigVeille();
    H.state.detailRows = [
      immeuble({ num_dau: 'A', demande_reference: 'SVAV-DEM-2026-000009' }),
      immeuble({ num_dau: 'B', demande_reference: null }),
    ];
    const r = await lireDetailPermisCommune(cfg, '75056', '6m', null);
    expect(r.find((p) => p.numDau === 'A')!.demandeReference).toBe('SVAV-DEM-2026-000009');
    expect(r.find((p) => p.numDau === 'B')!.demandeReference).toBeNull();
  });
});

describe('Q2b — lireDetailPermisCommune : borne de période', () => {
  it('période par défaut (clé absente → 6 mois) → borne de date LIÉE (code_insee + date)', async () => {
    const cfg = await chargerConfigVeille();
    await lireDetailPermisCommune(cfg, '75056', null, null);
    const q = detailQuery();
    expect(q.sql.replace(/\s+/g, ' ')).toContain('d.date_reelle_autorisation >= $2');
    expect(q.params).toHaveLength(2);
    expect(q.params[0]).toBe('75056');
    expect(String(q.params[1])).toMatch(/^\d{4}-\d{2}-\d{2}$/); // dateMinMois(6)
  });

  it('« origine » → AUCUNE borne de date (tout l’historique) : un seul paramètre lié', async () => {
    const cfg = await chargerConfigVeille();
    await lireDetailPermisCommune(cfg, '75056', 'origine', null);
    const q = detailQuery();
    expect(q.sql).not.toContain('date_reelle_autorisation >= $');
    expect(q.params).toEqual(['75056']);
  });
});

describe('Q4 — paramsLot : fenêtre d’ancienneté (dateMin dérivé ; au maximum = comportement d’avant Q4)', () => {
  const cfg = { ancienneteMaxDemandeAnnees: 2, dossiersParDemande: 5, permisParCommuneParMois: 5 } as unknown as ConfigVeille;

  it('absent === explicitement au maximum (12 × ancienneté) : EXACTEMENT la même dateMin', () => {
    expect(paramsLot(cfg).dateMin).toBe(paramsLot(cfg, 24).dateMin);
    expect(paramsLot(cfg, 999).dateMin).toBe(paramsLot(cfg).dateMin); // ≥ maximum → branche dateMinDepuis (comme l’avant-Q4)
  });

  it('une fenêtre plus courte donne une dateMin PLUS RÉCENTE (borne resserrée)', () => {
    const court = paramsLot(cfg, 3).dateMin!;
    const max = paramsLot(cfg).dateMin!;
    expect(court > max).toBe(true); // ISO 'AAAA-MM-JJ' : plus récent = lexicographiquement supérieur
  });

  it('les autres paramètres du lot ne dépendent PAS de la fenêtre', () => {
    expect(paramsLot(cfg, 3).dossiersParDemande).toBe(5);
    expect(paramsLot(cfg, 3).permisParCommuneParMois).toBe(5);
  });
});
