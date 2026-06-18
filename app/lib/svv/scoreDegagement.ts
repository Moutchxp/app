/**
 * Score de qualité de vue — Famille 1 « Dégagement objectif » (50 pts).
 *
 * LOGIQUE PURE : aucune donnée IGN, aucune photo, aucune IA. Le moteur consomme
 * des résultats géométriques DÉJÀ résolus (distances par faisceau) et n'en
 * recalcule aucun.
 *
 * Réf autoritative : SPEC_score_qualite_vue.md (Famille 1). Toutes les
 * constantes proviennent de config.ts — jamais de valeur en dur ici.
 *
 * Aucun arrondi (CLAUDE.md §5) : valeurs continues de bout en bout. La sélection
 * d'un secteur d'orientation (classification en buckets de 45°) n'est pas un
 * arrondi de valeur calculée.
 */
import {
  THRESHOLD_M,
  SCORE_DISTANCE_MAX_PTS,
  SCORE_DISTANCE_STEP_M,
  AMPLITUDE_BEAM_COUNT,
  AMPLITUDE_PART_A_PTS,
  AMPLITUDE_PART_B_PTS,
  AMPLITUDE_PART_B_BASE_M,
  AMPLITUDE_PART_B_BASE_PTS,
  CLEAR_BEAM_DIST_M,
  L_PENALTY_FLANK_DEG,
  L_PENALTY_DIST_M,
  L_PENALTY_FACTOR,
  ORIENTATION_PTS,
  ORIENTATION_SECTEURS,
  TOP_FLOOR_BONUS,
  type Orientation,
} from './config';

export interface FaisceauResultat {
  /** Angle par rapport à l'axe principal (négatif à gauche, positif à droite). */
  offsetDeg: number;
  /** Distance du 1er obstacle (m) ; `null` si le faisceau est dégagé. */
  distanceObstacleM: number | null;
}

export interface EntreeFamille1 {
  /** Distance du 1er obstacle sur l'axe principal (m) ; `null` = aucun obstacle. */
  distanceAxePrincipalM: number | null;
  /** Doit contenir exactement `AMPLITUDE_BEAM_COUNT` (61) faisceaux. */
  faisceaux: FaisceauResultat[];
  /** Azimut géographique de l'axe principal (0..360). */
  orientationAzimutDeg: number;
  dernierEtage: boolean;
}

export interface ScoreFamille1 {
  total: number; // /50
  distance: number; // /20
  amplitude: number; // /20 (après pénalité éventuelle)
  orientation: number; // /10
  detail: {
    amplitudePartA: number; // /10 (largeur)
    amplitudePartB: number; // /10 (profondeur)
    penaliteFlancAppliquee: boolean;
    moyenneProfondeurM: number;
    pourcentageFaisceauxDegages: number;
    secteurOrientation: Orientation;
    bonusDernierEtage: number; // 0 ou 1
  };
}

const clamp = (v: number, min: number, max: number): number =>
  Math.min(Math.max(v, min), max);

/** Normalise un azimut dans [0, 360). */
const normalizeAzimut = (deg: number): number => ((deg % 360) + 360) % 360;

/**
 * Convertit un azimut géographique en secteur d'orientation (8 secteurs de 45°,
 * centrés sur N=0). Le pas est dérivé du nombre de secteurs, jamais codé en dur.
 */
export function azimutVersSecteur(deg: number): Orientation {
  const pas = 360 / ORIENTATION_SECTEURS.length;
  const index = Math.round(normalizeAzimut(deg) / pas) % ORIENTATION_SECTEURS.length;
  return ORIENTATION_SECTEURS[index];
}

/** Un faisceau est « dégagé » si sans obstacle, ou obstacle au-delà du seuil. */
function estDegage(f: FaisceauResultat): boolean {
  return f.distanceObstacleM === null || f.distanceObstacleM >= THRESHOLD_M;
}

/** Profondeur retenue pour un faisceau (dégagé → distance créditée). */
function profondeur(f: FaisceauResultat): number {
  return f.distanceObstacleM === null ? CLEAR_BEAM_DIST_M : f.distanceObstacleM;
}

export function scoreFamille1(entree: EntreeFamille1): ScoreFamille1 {
  if (entree.faisceaux.length !== AMPLITUDE_BEAM_COUNT) {
    throw new Error(
      `scoreFamille1 : ${AMPLITUDE_BEAM_COUNT} faisceaux attendus, ${entree.faisceaux.length} reçus.`,
    );
  }

  // 1) Distance — 20 pts.
  const d = entree.distanceAxePrincipalM;
  const distance =
    d === null
      ? SCORE_DISTANCE_MAX_PTS
      : clamp((d - THRESHOLD_M) / SCORE_DISTANCE_STEP_M, 0, SCORE_DISTANCE_MAX_PTS);

  // 2) Amplitude — 20 pts (Part A largeur + Part B profondeur).
  const nbDegages = entree.faisceaux.filter(estDegage).length;
  const pourcentageFaisceauxDegages = nbDegages / AMPLITUDE_BEAM_COUNT;
  const amplitudePartA = AMPLITUDE_PART_A_PTS * pourcentageFaisceauxDegages;

  const moyenneProfondeurM =
    entree.faisceaux.reduce((acc, f) => acc + profondeur(f), 0) / AMPLITUDE_BEAM_COUNT;
  // Linéaire de (30 m → 1 pt) à (CLEAR_BEAM_DIST_M → 10 pts) : une vue 100 %
  // dégagée (moyenne = CLEAR_BEAM_DIST_M) atteint le plafond. Pente dérivée.
  const partBPente =
    (AMPLITUDE_PART_B_PTS - AMPLITUDE_PART_B_BASE_PTS) /
    (CLEAR_BEAM_DIST_M - AMPLITUDE_PART_B_BASE_M);
  const amplitudePartB = clamp(
    AMPLITUDE_PART_B_BASE_PTS + (moyenneProfondeurM - AMPLITUDE_PART_B_BASE_M) * partBPente,
    0,
    AMPLITUDE_PART_B_PTS,
  );

  let amplitude = amplitudePartA + amplitudePartB;

  // Pénalité « angle de L » : mur réel proche dans un flanc.
  const [flancMin, flancMax] = L_PENALTY_FLANK_DEG;
  const penaliteFlancAppliquee = entree.faisceaux.some((f) => {
    if (f.distanceObstacleM === null) return false;
    const abs = Math.abs(f.offsetDeg);
    return abs >= flancMin && abs <= flancMax && f.distanceObstacleM < L_PENALTY_DIST_M;
  });
  if (penaliteFlancAppliquee) {
    amplitude = amplitude / L_PENALTY_FACTOR;
  }

  // 3) Orientation — 10 pts.
  const secteurOrientation = azimutVersSecteur(entree.orientationAzimutDeg);
  const baseOrientation = ORIENTATION_PTS[secteurOrientation];
  const maxOrientation = Math.max(...Object.values(ORIENTATION_PTS)); // plafond = meilleur secteur
  const bonusDernierEtage =
    entree.dernierEtage && baseOrientation < maxOrientation ? TOP_FLOOR_BONUS : 0;
  const orientation = clamp(baseOrientation + bonusDernierEtage, 0, maxOrientation);

  return {
    total: distance + amplitude + orientation,
    distance,
    amplitude,
    orientation,
    detail: {
      amplitudePartA,
      amplitudePartB,
      penaliteFlancAppliquee,
      moyenneProfondeurM,
      pourcentageFaisceauxDegages,
      secteurOrientation,
      bonusDernierEtage,
    },
  };
}
