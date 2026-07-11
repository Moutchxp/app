import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./requete', () => ({ lireGrandLivre: vi.fn().mockResolvedValue([]) }));

import {
  traficParTranche,
  repartitionVerdicts,
  comptesAnalyses,
  entonnoir,
  repartitionCommune,
  provenance,
  serieParTranche,
  verdictsCommune,
} from './metriques';
import { lireGrandLivre } from './requete';

const q = lireGrandLivre as unknown as ReturnType<typeof vi.fn>;
const F = { debut: '2026-01-01', fin: '2026-01-31', grain: 'jour' as const };
const sqlDe = (i = 0) => q.mock.calls[i][0] as string;

beforeEach(() => vi.clearAllMocks());

describe('métriques — lisent le GRAND LIVRE, jamais les sessions brutes', () => {
  it('AUCUNE métrique ne touche analytics_session ; toutes lisent analytics_compteur_jour', async () => {
    q.mockResolvedValue([]);
    await traficParTranche(F);
    await repartitionVerdicts(F);
    await comptesAnalyses(F);
    await entonnoir(F);
    await repartitionCommune(F, 11);
    await provenance(F, 11);
    expect(q.mock.calls.length).toBeGreaterThanOrEqual(6);
    for (const call of q.mock.calls) {
      const sql = call[0] as string;
      expect(sql).not.toMatch(/analytics_session/i); // JAMAIS de session brute
      expect(sql).toMatch(/analytics_compteur_jour/i); // toujours le grand livre agrégé
      expect(sql).toMatch(/jour_paris >= \$1::date AND jour_paris <= \$2::date/); // fenêtre indexable
    }
  });
});

describe('M-2 trafic (visites) — source session_fin', () => {
  it('somme n par bucket, libellé visites', async () => {
    q.mockResolvedValueOnce([{ bucket: '2026-01-01', n: '5' }, { bucket: '2026-01-02', n: '9' }]);
    const r = await traficParTranche(F);
    expect(r).toEqual([{ bucket: '2026-01-01', visites: 5 }, { bucket: '2026-01-02', visites: 9 }]);
    expect(sqlDe()).toMatch(/nom = 'session_fin'/);
  });
});

describe('M-5 verdicts — 3 buckets sur resultat', () => {
  it('sans/vis/indeterminé + total (dénominateur = analyses réalisées)', async () => {
    q.mockResolvedValueOnce([
      { verdict: 'SANS_VIS_A_VIS', n: '7' },
      { verdict: 'VIS_A_VIS', n: '3' },
      { verdict: 'INDETERMINE', n: '2' },
    ]);
    const r = await repartitionVerdicts(F);
    expect(r).toEqual({ sans_vis_a_vis: 7, vis_a_vis: 3, indetermine: 2, total: 12 });
    expect(sqlDe()).toMatch(/nom = 'resultat'/);
  });
});

describe('M-4 analyses — lancées / résultats + conversions (Chantier A)', () => {
  it('sépare analyse_lancee et resultat ; conversions à 0 si absentes', async () => {
    q.mockResolvedValueOnce([{ nom: 'analyse_lancee', n: '10' }, { nom: 'resultat', n: '8' }]);
    expect(await comptesAnalyses(F)).toEqual({
      lancees: 10, resultats: 8, certificats: 0, plusvalue: 0, estimationImmo: 0, totalEstimations: 0,
    });
  });
  it('fenêtre VIDE (aucun événement) → les 6 champs PRÉSENTS à 0, jamais undefined (contrat serveur anti-crash KPI)', async () => {
    q.mockResolvedValueOnce([]); // aucune ligne dans la fenêtre
    expect(await comptesAnalyses(F)).toEqual({
      lancees: 0, resultats: 0, certificats: 0, plusvalue: 0, estimationImmo: 0, totalEstimations: 0,
    });
  });
  it('total_estimations = plusvalue + estimation_immo ; certificat isolé ; UNE requête, AUCUN k', async () => {
    q.mockResolvedValueOnce([
      { nom: 'resultat', n: '8' },
      { nom: 'clic_certificat', n: '5' },
      { nom: 'clic_plusvalue', n: '3' },
      { nom: 'clic_estimation', n: '4' },
    ]);
    const r = await comptesAnalyses(F);
    expect(r.certificats).toBe(5);
    expect(r.plusvalue).toBe(3);
    expect(r.estimationImmo).toBe(4);
    expect(r.totalEstimations).toBe(7); // 3 + 4, sommé à la lecture (jamais 3 additionnés à tort)
    const sql = sqlDe();
    expect(sql).toMatch(/clic_certificat/);
    expect(sql).toMatch(/clic_plusvalue/);
    expect(sql).toMatch(/clic_estimation/);
    expect(q.mock.calls.length).toBe(1); // un seul SELECT groupé (pas de ventilation par nom)
  });
});

describe('M-6 remplacement — entonnoir (étape la plus loin, source session_fin)', () => {
  it('ordonné par le funnel, étapes absentes à 0', async () => {
    q.mockResolvedValueOnce([{ etape: 'resultat', n: '4' }, { etape: 'photo', n: '6' }]);
    const r = await entonnoir(F);
    expect(r[0]).toEqual({ etape: 'intro', atteinte_max: 0 });
    expect(r.find((x) => x.etape === 'photo')).toEqual({ etape: 'photo', atteinte_max: 6 });
    expect(r.find((x) => x.etape === 'resultat')).toEqual({ etape: 'resultat', atteinte_max: 4 });
    expect(sqlDe()).toMatch(/nom = 'session_fin'/);
  });
});

describe('M-7 communes — k-anonymisée', () => {
  it('applique le seuil k ; commune < k masquée', async () => {
    q.mockResolvedValueOnce([
      { commune_insee: '92004', n: '50' },
      { commune_insee: '75056', n: '8' },
      { commune_insee: '93001', n: '3' },
    ]);
    const r = await repartitionCommune(F, 11);
    expect(r.visibles.map((c) => c.commune_insee)).toEqual(['92004']); // seule ≥ 11
    expect(r.masque?.nbCellules).toBe(2); // 75056 (8) + 93001 (3) masquées
    expect(sqlDe()).toMatch(/commune_insee IS NOT NULL/);
  });
});

describe('M-8 série temporelle (Lot 6) — GLOBALE par bucket, SANS k, jamais de commune', () => {
  it('fusionne visites (session_fin) + analyses (analyse_lancee) + résultats/verdicts par bucket', async () => {
    q.mockResolvedValueOnce([{ bucket: '2026-01-01', n: '5' }, { bucket: '2026-01-02', n: '9' }]); // session_fin
    q.mockResolvedValueOnce([{ bucket: '2026-01-01', n: '3' }]); //                                    analyse_lancee
    q.mockResolvedValueOnce([
      { bucket: '2026-01-01', verdict: 'SANS_VIS_A_VIS', n: '2' },
      { bucket: '2026-01-01', verdict: 'VIS_A_VIS', n: '1' },
      { bucket: '2026-01-02', verdict: 'SANS_VIS_A_VIS', n: '4' },
    ]); // resultat × verdict
    const r = await serieParTranche(F);
    expect(r).toEqual([
      { bucket: '2026-01-01', visites: 5, analysesLancees: 3, resultats: 3, sans: 2, vis: 1, ind: 0, certificats: 0, plusvalue: 0, estimationImmo: 0, totalEstimations: 0 },
      { bucket: '2026-01-02', visites: 9, analysesLancees: 0, resultats: 4, sans: 4, vis: 0, ind: 0, certificats: 0, plusvalue: 0, estimationImmo: 0, totalEstimations: 0 },
    ]);
    for (const c of q.mock.calls) expect(c[0]).not.toMatch(/commune_insee/); // série GLOBALE : aucune dimension commune
  });

  it('conversions (Chantier A) : certificat/plusvalue/estimation par bucket + total = plusvalue+estimation, SANS k', async () => {
    q.mockResolvedValueOnce([]); //                                              1. session_fin
    q.mockResolvedValueOnce([]); //                                              2. analyse_lancee
    q.mockResolvedValueOnce([]); //                                              3. resultat × verdict
    q.mockResolvedValueOnce([{ bucket: '2026-01-01', n: '5' }]); //              4. clic_certificat
    q.mockResolvedValueOnce([{ bucket: '2026-01-01', n: '3' }]); //              5. clic_plusvalue
    q.mockResolvedValueOnce([{ bucket: '2026-01-01', n: '4' }, { bucket: '2026-01-02', n: '2' }]); // 6. clic_estimation
    const r = await serieParTranche(F);
    const j1 = r.find((p) => p.bucket === '2026-01-01')!;
    const j2 = r.find((p) => p.bucket === '2026-01-02')!;
    expect([j1.certificats, j1.plusvalue, j1.estimationImmo, j1.totalEstimations]).toEqual([5, 3, 4, 7]); // 3+4
    expect([j2.certificats, j2.plusvalue, j2.estimationImmo, j2.totalEstimations]).toEqual([0, 0, 2, 2]); // 0+2
    // ordre des lireGrandLivre : les 3 conversions viennent APRÈS resultat (calls 4-6) et sont GLOBALES (sans commune).
    for (const c of q.mock.calls) expect(c[0]).not.toMatch(/commune_insee/);
    expect(q.mock.calls[3][0]).toMatch(/nom = 'clic_certificat'/);
    expect(q.mock.calls[4][0]).toMatch(/nom = 'clic_plusvalue'/);
    expect(q.mock.calls[5][0]).toMatch(/nom = 'clic_estimation'/);
  });
  it('ordre DÉTERMINISTE : un bucket introduit tardivement par `resultat` est retrié en tête', async () => {
    q.mockResolvedValueOnce([{ bucket: '2026-01-10', n: '5' }]); // session_fin (bucket tardif inséré en 1er)
    q.mockResolvedValueOnce([]); //                                 analyse_lancee
    q.mockResolvedValueOnce([{ bucket: '2026-01-02', verdict: 'SANS_VIS_A_VIS', n: '1' }]); // resultat : bucket ANTÉRIEUR
    const r = await serieParTranche(F);
    expect(r.map((p) => p.bucket)).toEqual(['2026-01-02', '2026-01-10']); // trié, jamais l'ordre d'insertion Map
  });
});

describe('M-7bis verdicts d’une commune (Lot 6) — k RE-APPLIQUÉ, jamais reconstruit', () => {
  it('scope par commune_insee (param LIÉ $3) ; verdict rare masqué + suppression secondaire', async () => {
    q.mockResolvedValueOnce([
      { verdict: 'SANS_VIS_A_VIS', n: '20' },
      { verdict: 'VIS_A_VIS', n: '15' },
      { verdict: 'INDETERMINE', n: '3' }, // < k → masqué ; secondaire tire la plus petite visible (15)
    ]);
    const r = await verdictsCommune(F, '92004', 11);
    expect(r.visibles.map((c) => c.verdict)).toEqual(['SANS_VIS_A_VIS']); // seule ≥ k après suppression secondaire
    expect(r.masque).toEqual({ nbCellules: 2, total: 18 }); // {15,3} agrégés (≥2 cellules, ≥ k)
    expect(q.mock.calls[0][0]).toMatch(/nom = 'resultat'/);
    expect(q.mock.calls[0][0]).toMatch(/commune_insee = \$3/);
    expect(q.mock.calls[0][1]).toEqual(['2026-01-01', '2026-01-31', '92004']); // $1,$2 fenêtre + $3 commune
  });

  it('résidu non sécurisable → `insuffisant` (RIEN restitué : jamais une valeur unique)', async () => {
    q.mockResolvedValueOnce([{ verdict: 'INDETERMINE', n: '4' }]); // 1 cellule < k, rien à agréger → tout supprimé
    const r = await verdictsCommune(F, '92004', 11);
    expect(r.insuffisant).toBe(true);
    expect(r.visibles).toEqual([]);
  });
});

describe('provenance — k-anonymisée (source/medium + referer)', () => {
  it('deux ventilations, chacune sous k', async () => {
    // insta(30) visible ; promo(6)+autre(7) forment un groupe masqué déjà sûr (≥2, somme 13 ≥ k).
    q.mockResolvedValueOnce([
      { source: 'insta', medium: 'social', n: '30' },
      { source: 'promo-dupont', medium: 'email', n: '6' },
      { source: 'autre', medium: 'x', n: '7' },
    ]);
    q.mockResolvedValueOnce([{ referer_hote: 'instagram.com', n: '30' }]);
    const r = await provenance(F, 11);
    expect(r.par_source_medium.visibles.map((c) => c.source)).toEqual(['insta']);
    expect(r.par_source_medium.masque?.nbCellules).toBe(2); // provenances rares masquées (dont campagne ciblée)
  });
});
