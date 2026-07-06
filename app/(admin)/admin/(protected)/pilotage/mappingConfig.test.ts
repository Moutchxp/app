import { describe, it, expect } from 'vitest';
import { META, formaterMalusPct } from './mappingConfig';

/** Les 46 noms de colonnes exacts de `config_scoring` (id=1), liste figée. */
const COLONNES_ATTENDUES = [
  'id',
  'boost_f2', 'boost_f4', 'forfait_cone_central', 'forfait_extremites', 'cone_f3_demi_angle_deg',
  'distance_max_m', 'plafond_couche1', 'plafond_degagement', 'mode_combinaison',
  'couloir_seuil_lateral_m', 'couloir_fenetre_condition_n', 'couloir_tolerance_bord_n', 'couloir_malus_pct',
  'natures_remarquables',
  'cone_famille_demi_angle_deg', 'mondial_faisceau_m',
  'mh_cone', 'mh_flanc', 'mh_distmax_m',
  'inv_cone', 'inv_flanc', 'inv_distmax_m',
  'a1900_cone', 'a1900_flanc', 'a1900_distmax_m',
  'a1935_cone', 'a1935_flanc', 'a1935_distmax_m',
  'cumul_seuil_min_m', 'cumul_base_m', 'cumul_pas_m', 'cumul_increment', 'cumul_plafond', 'cumul_cap_p1_m',
  'orientation_n', 'orientation_ne', 'orientation_e', 'orientation_se',
  'orientation_s', 'orientation_so', 'orientation_o', 'orientation_no',
  'borne_annee_1900', 'borne_annee_1935', 'analysis_range_m',
] as const;

describe('mappingConfig — META', () => {
  it('contient exactement 46 entrées', () => {
    expect(META.length).toBe(46);
  });

  it('couvre les 46 colonnes exactes, sans doublon ni intrus', () => {
    const noms = META.map((m) => m.colonne);
    // Aucun doublon.
    expect(new Set(noms).size).toBe(noms.length);
    // Ensemble = les 46 noms attendus (ni manquant, ni intrus).
    expect(new Set(noms)).toEqual(new Set(COLONNES_ATTENDUES));
  });

  it('le libellé de plafond_degagement n’emploie jamais le mot « plafond »', () => {
    const meta = META.find((m) => m.colonne === 'plafond_degagement');
    expect(meta).toBeDefined();
    expect(meta!.libelle.toLowerCase()).not.toContain('plafond');
  });
});

describe('mappingConfig — formaterMalusPct', () => {
  it('formate 0,01 en « 0,01 (= 1 %/faisceau) »', () => {
    expect(formaterMalusPct(0.01)).toBe('0,01 (= 1 %/faisceau)');
  });
  it('rend une valeur non standard SANS arrondi ni troncature (0,0125)', () => {
    expect(formaterMalusPct(0.0125)).toBe('0,0125 (= 1,25 %/faisceau)');
  });
});
