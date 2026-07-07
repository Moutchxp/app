/**
 * Loader `chargerProfilDegagement` — chargement des cartes d'année depuis `config_famille_annee`.
 * `query` est mockée : aucune connexion réelle (ce test ne touche PAS la base).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('./client', () => ({ query: (...args: unknown[]) => query(...args) }));

import { chargerProfilDegagement } from './profilConfig';
import { PROFIL_DEGAGEMENT_DEFAUT } from '../svv/profilDegagement';

/** Ligne `config_scoring` VALIDE minimale (mode reconnu, distance_max ≤ analysis_range). */
const LIGNE_CONFIG_SCORING = {
  boost_f2: 0.3, boost_f4: 2.5, forfait_cone_central: 300, forfait_extremites: 200,
  cone_f3_demi_angle_deg: 60, distance_max_m: 200, plafond_couche1: 90, plafond_degagement: 80,
  mode_combinaison: 'sequentiel', mode_combinaison_repli: 'addition',
  couloir_seuil_lateral_m: 3, couloir_fenetre_condition_n: 16, couloir_tolerance_bord_n: 2,
  couloir_malus_pct: 0.01, natures_remarquables: ['Eglise'],
  cone_famille_demi_angle_deg: 60, mondial_faisceau_m: 800,
  mh_cone: 2.0, mh_flanc: 1.5, mh_distmax_m: 400, inv_cone: 2.0, inv_flanc: 1.5, inv_distmax_m: 400,
  cumul_seuil_min_m: 30, cumul_base_m: 25, cumul_pas_m: 5, cumul_increment: 0.1, cumul_plafond: 2.0, cumul_cap_p1_m: 200,
  orientation_n: 0, orientation_ne: 1, orientation_e: 5, orientation_se: 8,
  orientation_s: 10, orientation_so: 9, orientation_o: 7, orientation_no: 3,
  analysis_range_m: 200,
};

/** Route le mock selon la table interrogée (config_scoring vs config_famille_annee). */
function router(cartesRows: unknown[] | (() => never)) {
  return (text: string) => {
    if (text.includes('config_famille_annee')) {
      if (typeof cartesRows === 'function') return Promise.reject(new Error('SELECT cartes en échec'));
      return Promise.resolve({ rows: cartesRows });
    }
    return Promise.resolve({ rows: [LIGNE_CONFIG_SCORING] });
  };
}

beforeEach(() => {
  query.mockReset();
});

describe('chargerProfilDegagement — cartes d\'année', () => {
  it('(a) 2 lignes → famillesAnnee mappé (ordre cone/flanc/distMaxM correct)', async () => {
    query.mockImplementation(router([
      { id: 1, borne_min: null, op_min: null, borne_max: 1900, op_max: '<=', cone: 1.5, flanc: 1.2, distmax_m: 300 },
      { id: 2, borne_min: 1900, op_min: '>', borne_max: 1935, op_max: '<=', cone: 1.2, flanc: 1.1, distmax_m: 200 },
    ]));
    const profil = await chargerProfilDegagement();
    expect(profil.famillesAnnee).toEqual([
      { borneMin: null, opMin: null, borneMax: 1900, opMax: '<=', cone: 1.5, flanc: 1.2, distMaxM: 300 },
      { borneMin: 1900, opMin: '>', borneMax: 1935, opMax: '<=', cone: 1.2, flanc: 1.1, distMaxM: 200 },
    ]);
  });

  it('(b) 0 ligne (table vide) → [] (état valide, PAS un repli)', async () => {
    query.mockImplementation(router([]));
    const profil = await chargerProfilDegagement();
    expect(profil.famillesAnnee).toEqual([]);
  });

  it('(c) SELECT cartes en échec → repli PROFIL_DEGAGEMENT_DEFAUT.famillesAnnee', async () => {
    query.mockImplementation(router(() => { throw new Error('boom'); }));
    const profil = await chargerProfilDegagement();
    expect(profil.famillesAnnee).toEqual(PROFIL_DEGAGEMENT_DEFAUT.famillesAnnee);
  });
});
