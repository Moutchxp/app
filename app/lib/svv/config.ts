/**
 * Configuration métier Sans Vis-à-Vis® — SOURCE UNIQUE des constantes.
 *
 * Toutes les valeurs métier (hauteurs, seuil, faisceau, score) sont centralisées
 * ici. Interdiction d'écrire ces nombres « en dur » ailleurs dans le code
 * (cf. CLAUDE.md §5 et §14).
 *
 * RÈGLES IMPÉRATIVES (CLAUDE.md) :
 *  - AUCUN ARRONDI : les calculs utilisent ces valeurs brutes telles quelles.
 *  - Le label binaire ne dépend QUE de la géométrie (≥ 40 m).
 *  - Le score de qualité de vue est indépendant du label.
 *
 * Réfs : SPEC_module_hauteurs_v3.md §10, SPEC_score_qualite_vue.md (Constantes).
 */

/**
 * Portée d'analyse partagée (mètres). Une seule définition pour toute la chaîne :
 *  - portée du faisceau d'obstacles (`BEAM_RANGE_M`) ;
 *  - distance créditée à un faisceau dégagé dans le score (`CLEAR_BEAM_DIST_M`) ;
 *  - plafond des 20 pts de distance dans le score (`SCORE_DISTANCE_MAX_M`).
 *
 * Ces trois usages DOIVENT rester égaux : ils dérivent tous d'`ANALYSIS_RANGE_M`
 * pour ne jamais diverger (verrouillé par config.test.ts).
 */
export const ANALYSIS_RANGE_M = 200;

/* ------------------------------------------------------------------ */
/* Hauteur de vision / point d'origine (CLAUDE.md §4)                  */
/* ------------------------------------------------------------------ */

/** Hauteur d'un étage complet, en mètres. VALEUR DÉFINITIVE. */
export const FLOOR_HEIGHT_M = 2.9;

/** Hauteur moyenne de l'œil humain à la fenêtre, en mètres. VALEUR DÉFINITIVE. */
export const EYE_HEIGHT_M = 1.65;

/**
 * Hauteur de vision pour un étage donné (rez-de-chaussée = 0).
 *   hauteur_vision = etage × 2.90 + 1.65
 * Aucun arrondi.
 */
export function hauteurVision(etage: number): number {
  return etage * FLOOR_HEIGHT_M + EYE_HEIGHT_M;
}

/**
 * Altitude (NGF) de la fenêtre d'observation.
 *   altitude_fenetre = altitude_terrain_origine + hauteur_vision(etage)
 * Aucun arrondi.
 */
export function altitudeFenetre(altitudeTerrainOrigine: number, etage: number): number {
  return altitudeTerrainOrigine + hauteurVision(etage);
}

/* ------------------------------------------------------------------ */
/* Verdict géométrique & faisceau (CLAUDE.md §2, SPEC_hauteurs §10)    */
/* ------------------------------------------------------------------ */

/** Seuil du label : premier obstacle réel ≥ 40 m → Sans Vis-à-Vis. */
export const THRESHOLD_M = 40;

/** Largeur du couloir de contrôle le long de l'axe (mètres, à calibrer). */
export const CORRIDOR_WIDTH_M = 2;

/** Pas d'échantillonnage le long de l'axe principal (mètres). */
export const CORRIDOR_STEP_M = 2;

/** Pas d'échantillonnage du faisceau = résolution MNS (mètres). */
export const BEAM_STEP_M = 0.5;

/** Portée d'analyse du faisceau d'obstacles (mètres). */
export const BEAM_RANGE_M = ANALYSIS_RANGE_M;

/** Périmètre du noyau anti-pic (mètres, à calibrer). */
export const SPIKE_KERNEL_M = 3;

/** CRS de travail métrique : Lambert-93. */
export const CRS_WORK = 2154;

/** CRS d'entrée GPS : WGS84. */
export const CRS_GPS = 4326;

/* ------------------------------------------------------------------ */
/* Tolérance du point d'origine (CLAUDE.md « Point d'origine »)        */
/* ------------------------------------------------------------------ */

/** Tolérance max vers l'extérieur du polygone bâtiment (mètres). */
export const ORIGIN_OUTSIDE_TOLERANCE_M = 0.3;

/* ================================================================== */
/* SCORE DE QUALITÉ DE VUE (SPEC_score_qualite_vue.md)                 */
/* Indépendant du label binaire.                                       */
/* ================================================================== */

/* Pondération des deux familles (50 / 50) */
export const SCORE_FAMILLE_1_WEIGHT = 50; // dégagement objectif
export const SCORE_FAMILLE_2_WEIGHT = 50; // qualité du paysage

/* Famille 1 — distance au 1er obstacle (axe principal) */
export const SCORE_DISTANCE_MAX_PTS = 20;
export const SCORE_DISTANCE_MIN_M = THRESHOLD_M; // 0 pt à 40 m (= seuil du label)
export const SCORE_DISTANCE_MAX_M = ANALYSIS_RANGE_M; // 20 pts à ≥ 200 m
export const SCORE_DISTANCE_STEP_M = 8; // +1 pt tous les 8 m

/* Famille 1 — amplitude du dégagement (61 faisceaux) */
export const AMPLITUDE_BEAM_STEP_DEG = 3;
export const AMPLITUDE_BEAM_COUNT = 61;
export const AMPLITUDE_PART_A_PTS = 10;
export const AMPLITUDE_PART_B_PTS = 10;
export const AMPLITUDE_PART_B_BASE_M = 30; // 30 m → 1 pt
export const AMPLITUDE_PART_B_STEP_M = 20; // +1 pt / 20 m
export const CLEAR_BEAM_DIST_M = ANALYSIS_RANGE_M; // distance d'un faisceau dégagé

/* Pénalité « angle de L » */
export const L_PENALTY_FLANK_DEG: readonly [number, number] = [60, 90];
export const L_PENALTY_DIST_M = 5;
export const L_PENALTY_FACTOR = 3; // amplitude / 3

/* Famille 1 — orientation (points par secteur) */
export const ORIENTATION_PTS = {
  S: 10,
  SO: 10,
  SE: 8,
  O: 7,
  NO: 6,
  E: 4,
  NE: 2,
  N: 0,
} as const;
export type Orientation = keyof typeof ORIENTATION_PTS;

/** Bonus dernier étage : +1, uniquement si l'orientation rapporte < 10 pts. */
export const TOP_FLOOR_BONUS = 1;

/* Famille 2 — monument iconique */
export const MONUMENT_CENTRAL_HALF_DEG = 50; // champ central = ±50°
/** Pas de plafond de distance pour le test de ligne de vue du monument. */
export const MONUMENT_LOS_MAX_M: number | null = null;

/* Famille 2 — nuisances issues des données */
export const NUISANCE_AXIS_TALL_DEG = 20; // ±20° : grand immeuble dans l'axe
export const TALL_RESIDENTIAL_MIN_FLOORS = 15;
export const PARABOLES_MIN_FLOORS = 10;
export const CARREFOUR_CIMETIERE_DEG = 45; // ±45° champ central

/* Étiquettes d'affichage du score (libellés terminaux, ne nourrissent aucun calcul) */
export const SCORE_LABEL_EXCEPTIONNELLE_MIN = 75; // ≥ 75 → « Vue exceptionnelle »
export const SCORE_LABEL_EXCELLENTE_MIN = 60; // 60–74 → « Excellente vue »
