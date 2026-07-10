import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./requete', () => ({ lireGrandLivre: vi.fn().mockResolvedValue([]) }));

import {
  traficParTranche,
  repartitionVerdicts,
  comptesAnalyses,
  entonnoir,
  repartitionCommune,
  provenance,
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

describe('M-4 analyses — lancées / résultats', () => {
  it('sépare analyse_lancee et resultat', async () => {
    q.mockResolvedValueOnce([{ nom: 'analyse_lancee', n: '10' }, { nom: 'resultat', n: '8' }]);
    expect(await comptesAnalyses(F)).toEqual({ lancees: 10, resultats: 8 });
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
