import { describe, it, expect } from 'vitest';
import { META, MODES_COMBINAISON, MODES_REPLI, formaterMalusPct, metaParColonne } from './mappingConfig';

/** Les 39 noms de colonnes exacts de `config_scoring` (id=1), liste figée. */
const COLONNES_ATTENDUES = [
  'id',
  'boost_f2', 'boost_f4', 'forfait_cone_central', 'forfait_extremites', 'cone_f3_demi_angle_deg',
  'distance_max_m', 'plafond_couche1', 'plafond_degagement', 'mode_combinaison', 'mode_combinaison_repli',
  'couloir_seuil_lateral_m', 'couloir_fenetre_condition_n', 'couloir_tolerance_bord_n', 'couloir_malus_pct',
  'natures_remarquables',
  'cone_famille_demi_angle_deg', 'mondial_faisceau_m',
  'mh_cone', 'mh_flanc', 'mh_distmax_m',
  'inv_cone', 'inv_flanc', 'inv_distmax_m',
  'cumul_seuil_min_m', 'cumul_base_m', 'cumul_pas_m', 'cumul_increment', 'cumul_plafond', 'cumul_cap_p1_m',
  'orientation_n', 'orientation_ne', 'orientation_e', 'orientation_se',
  'orientation_s', 'orientation_so', 'orientation_o', 'orientation_no',
  'analysis_range_m',
] as const;

describe('mappingConfig — META', () => {
  it('contient exactement 39 entrées', () => {
    expect(META.length).toBe(39);
  });

  it('couvre les 39 colonnes exactes, sans doublon ni intrus', () => {
    const noms = META.map((m) => m.colonne);
    // Aucun doublon.
    expect(new Set(noms).size).toBe(noms.length);
    // Ensemble = les 39 noms attendus (ni manquant, ni intrus).
    expect(new Set(noms)).toEqual(new Set(COLONNES_ATTENDUES));
  });

  it('le libellé de plafond_degagement n’emploie jamais le mot « plafond »', () => {
    const meta = META.find((m) => m.colonne === 'plafond_degagement');
    expect(meta).toBeDefined();
    expect(meta!.libelle.toLowerCase()).not.toContain('plafond');
  });
});

describe('mappingConfig — métadonnées d’édition (M1)', () => {
  it('les 39 colonnes portent `type` et `editable`', () => {
    for (const m of META) {
      expect(['nombre', 'entier', 'enum', 'liste']).toContain(m.type);
      expect(typeof m.editable).toBe('boolean');
    }
  });

  it('les 39 colonnes portent une `infobulle` non vide', () => {
    for (const m of META) {
      expect(typeof m.infobulle, m.colonne).toBe('string');
      expect((m.infobulle ?? '').length, m.colonne).toBeGreaterThan(0);
    }
  });

  it('les 5 VESTIGIALE + `id` sont `editable: false`', () => {
    const nonEditables = [
      'id',
      // 5 vestigiales « Héritage » historiques
      'boost_f2', 'forfait_cone_central', 'forfait_extremites', 'cone_f3_demi_angle_deg', 'natures_remarquables',
    ];
    for (const nom of nonEditables) {
      const m = META.find((x) => x.colonne === nom);
      expect(m, nom).toBeDefined();
      expect(m!.editable, nom).toBe(false);
    }
  });

  it('toutes les autres colonnes sont éditables', () => {
    const nonEditables = new Set([
      'id',
      'boost_f2', 'forfait_cone_central', 'forfait_extremites', 'cone_f3_demi_angle_deg', 'natures_remarquables',
      'analysis_range_m', // MIROIR verrouillé (garde-fou intangible) — non éditable, mais PAS vestigiale
    ]);
    for (const m of META) {
      if (!nonEditables.has(m.colonne)) expect(m.editable, m.colonne).toBe(true);
    }
  });

  it('analysis_range_m est VERROUILLÉE : editable=false ET statut reste MIROIR (jamais VESTIGIALE)', () => {
    const m = META.find((x) => x.colonne === 'analysis_range_m');
    expect(m).toBeDefined();
    // Les DEUX doivent tenir : un futur refactor ne doit ni la rendre éditable, ni la basculer en VESTIGIALE.
    expect(m!.editable).toBe(false);
    expect(m!.statut).toBe('MIROIR');
    // Elle n'est PAS vestigiale → ne tombera pas dans la section repliée (le front filtre sur ce flag).
    expect(m!.statut).not.toBe('VESTIGIALE');
  });

  it('les 5 VESTIGIALE « Héritage » sont bien VESTIGIALE et non éditables', () => {
    const vestigiales = [
      'boost_f2', 'forfait_cone_central', 'forfait_extremites', 'cone_f3_demi_angle_deg', 'natures_remarquables',
    ];
    for (const nom of vestigiales) {
      const m = META.find((x) => x.colonne === nom);
      expect(m, nom).toBeDefined();
      expect(m!.statut, nom).toBe('VESTIGIALE');
      expect(m!.editable, nom).toBe(false);
    }
    // Recap global : 5 VESTIGIALE au total.
    expect(META.filter((m) => m.statut === 'VESTIGIALE').length).toBe(5);
  });

  it('pour chaque colonne bornée, min ≤ defaut ≤ max', () => {
    for (const m of META) {
      if (typeof m.min === 'number' && typeof m.max === 'number') {
        expect(m.min, `${m.colonne} min ≤ max`).toBeLessThanOrEqual(m.max);
        expect(typeof m.defaut, `${m.colonne} defaut numérique`).toBe('number');
        const d = m.defaut as number;
        expect(d, `${m.colonne} min ≤ defaut`).toBeGreaterThanOrEqual(m.min);
        expect(d, `${m.colonne} defaut ≤ max`).toBeLessThanOrEqual(m.max);
      }
    }
  });

  it('les 5 dénominateurs/diviseurs du moteur ont min ≥ 1 (jamais 0)', () => {
    const diviseurs = ['distance_max_m', 'cumul_pas_m', 'cumul_base_m', 'cumul_plafond', 'plafond_couche1', 'plafond_degagement'];
    for (const nom of diviseurs) {
      const m = META.find((x) => x.colonne === nom);
      expect(m, nom).toBeDefined();
      expect(m!.min, nom).toBeGreaterThanOrEqual(1);
    }
  });

  it('mode_combinaison est un enum VIVE éditable (optionsEnum = MODES_COMBINAISON) dont le défaut est valide', () => {
    const m = META.find((x) => x.colonne === 'mode_combinaison')!;
    expect(m.type).toBe('enum');
    expect(m.editable).toBe(true);
    expect(m.statut).toBe('VIVE');
    expect(m.optionsEnum).toEqual(MODES_COMBINAISON);
    expect(MODES_COMBINAISON).toContain(m.defaut as string);
  });

  it('mode_combinaison_repli est un enum DE GARDE éditable (optionsEnum = MODES_REPLI, défaut addition)', () => {
    const m = META.find((x) => x.colonne === 'mode_combinaison_repli')!;
    expect(m.type).toBe('enum');
    expect(m.editable).toBe(true);
    expect(m.statut).toBe('DE GARDE');
    expect(m.optionsEnum).toEqual(MODES_REPLI);
    expect(m.defaut).toBe('addition');
    expect(MODES_REPLI).toContain(m.defaut as string);
  });

  it('metaParColonne renvoie l’entrée ou undefined (allowlist)', () => {
    expect(metaParColonne('plafond_degagement')?.colonne).toBe('plafond_degagement');
    expect(metaParColonne('colonne_inexistante')).toBeUndefined();
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
