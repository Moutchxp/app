import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock du pool pg générique (client.ts) — aucune vraie connexion en test.
const queryMock = vi.fn();
vi.mock('../../../../lib/db/client', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));

import { GET } from './route';

/** Les 39 colonnes attendues dans la réponse. */
const COLONNES = [
  'id', 'boost_f2', 'boost_f4', 'forfait_cone_central', 'forfait_extremites', 'cone_f3_demi_angle_deg',
  'distance_max_m', 'plafond_couche1', 'plafond_degagement', 'mode_combinaison', 'mode_combinaison_repli',
  'couloir_seuil_lateral_m', 'couloir_fenetre_condition_n', 'couloir_tolerance_bord_n', 'couloir_malus_pct',
  'natures_remarquables', 'cone_famille_demi_angle_deg', 'mondial_faisceau_m',
  'mh_cone', 'mh_flanc', 'mh_distmax_m', 'inv_cone', 'inv_flanc', 'inv_distmax_m',
  'cumul_seuil_min_m', 'cumul_base_m', 'cumul_pas_m', 'cumul_increment', 'cumul_plafond', 'cumul_cap_p1_m',
  'orientation_n', 'orientation_ne', 'orientation_e', 'orientation_se',
  'orientation_s', 'orientation_so', 'orientation_o', 'orientation_no',
  'analysis_range_m',
];

/** Fabrique une ligne complète (valeurs = seed migration 003). */
function ligneComplete(): Record<string, unknown> {
  const l: Record<string, unknown> = {};
  for (const c of COLONNES) l[c] = 1;
  l.mode_combinaison = 'max';
  l.mode_combinaison_repli = 'addition';
  l.distance_max_m = 200;
  l.analysis_range_m = 200;
  l.natures_remarquables = ['Eglise'];
  return l;
}

beforeEach(() => {
  queryMock.mockReset();
});

describe('GET /api/admin/config', () => {
  it('renvoie present:true + les 39 colonnes + repli', async () => {
    queryMock.mockResolvedValue({ rows: [ligneComplete()] });
    const res = await GET();
    const body = await res.json();
    expect(body.present).toBe(true);
    for (const c of COLONNES) expect(body.valeurs).toHaveProperty(c);
    expect(body.repli).toEqual({ actif: true, raisons: [] });
  });

  it('rows vides → present:false', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const res = await GET();
    const body = await res.json();
    expect(body.present).toBe(false);
  });

  it('query rejette → 503 + erreur maîtrisée', async () => {
    queryMock.mockRejectedValue(new Error('db down'));
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.present).toBe(false);
    expect(body.erreur).toBe('configuration indisponible');
  });
});
