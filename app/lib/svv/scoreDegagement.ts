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
  AMPLITUDE_BEAM_STEP_DEG,
  AMPLITUDE_NOTE_HALF_ANGLE_DEG,
  AMPLITUDE_PART_A_PTS,
  AMPLITUDE_PART_B_PTS,
  AMPLITUDE_PART_B_BASE_M,
  AMPLITUDE_PART_B_BASE_PTS,
  CLEAR_BEAM_DIST_M,
  FLANC_DIST_SEVERE_M,
  FLANC_DIST_MODERE_M,
  FLANC_DIV_SEVERE,
  FLANC_DIV_MODERE,
  FLANC_FAISCEAUX_CONSEC_MIN,
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
  // --- Enrichissement Couche 1 du Résultat B (OPTIONNEL, NULLABLE) ----------------------------
  // N'INTERVIENT PAS dans le calcul du Résultat A (distance/amplitude/total). Renseigné quand un
  // obstacle est retenu (côté BD TOPO) ; sinon undefined. Consommé plus tard par coucheDegagement.
  /** LineString origine→portée 200 m (SRID 2154) du faisceau (F4 traversée nature/eau). */
  rayonWkt?: string;
  /** cleabs du 1er obstacle (jointure F2 `bdnb_annee_batiment` <1900). */
  impactCleabs?: string | null;
  /** `bdtopo_batiment.nature` du 1er obstacle (F3 remarquable). */
  impactNature?: string | null;
  /** Point d'impact (SRID 2154) = origine + dist·(sin,cos) (F2/F3). */
  impactPointWkt?: string | null;
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

/**
 * Diviseur d'amplitude d'UN flanc (gauche ou droit), ou `1` si le flanc ne déclenche pas.
 * Déclenchement : >= FLANC_FAISCEAUX_CONSEC_MIN faisceaux CONSÉCUTIFS (offsets se suivant de
 * AMPLITUDE_BEAM_STEP_DEG) ayant tous un obstacle <= FLANC_DIST_MODERE_M (null/>7/trou d'offset
 * cassent la suite). Palier (si déclenché) = plus courte distance d'obstacle de TOUT le flanc :
 * < FLANC_DIST_SEVERE_M → FLANC_DIV_SEVERE, sinon FLANC_DIV_MODERE. Tri défensif par offset.
 */
// TODO migration Couche 1 B — flanc : fonction CONSERVÉE mais NON APPELÉE par le Résultat A
// (la pénalité de flanc sera ré-activée dans la Couche 1 du Résultat B). Ne pas supprimer.
function diviseurFlanc(beamsFlanc: FaisceauResultat[]): number {
  const tri = [...beamsFlanc].sort((a, b) => a.offsetDeg - b.offsetDeg);
  let maxRun = 0;
  let run = 0;
  let prevOffset: number | null = null;
  for (const f of tri) {
    const obstacleProche =
      f.distanceObstacleM !== null && f.distanceObstacleM <= FLANC_DIST_MODERE_M;
    if (!obstacleProche) {
      run = 0;
    } else if (prevOffset !== null && f.offsetDeg - prevOffset === AMPLITUDE_BEAM_STEP_DEG) {
      run += 1;
    } else {
      run = 1; // obstacle proche mais début de suite (1er faisceau ou offset non contigu)
    }
    prevOffset = f.offsetDeg;
    if (run > maxRun) maxRun = run;
  }
  if (maxRun < FLANC_FAISCEAUX_CONSEC_MIN) return 1; // flanc non déclenché

  // Palier : plus courte distance d'obstacle de TOUT le flanc (pas seulement la suite).
  const distances = beamsFlanc
    .map((f) => f.distanceObstacleM)
    .filter((d): d is number => d !== null);
  const dMin = Math.min(...distances);
  return dMin < FLANC_DIST_SEVERE_M ? FLANC_DIV_SEVERE : FLANC_DIV_MODERE;
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
  // La NOTE ne compte QUE le cône central |offsetDeg| <= AMPLITUDE_NOTE_HALF_ANGLE_DEG ;
  // les faisceaux de bord (> seuil) ne servent QU'À la pénalité de flanc (ensembles complémentaires).
  // Le balayage physique reste 61 faisceaux ±90° (AMPLITUDE_BEAM_COUNT inchangé, garde ci-dessus).
  const faisceauxCentraux = entree.faisceaux.filter(
    (f) => Math.abs(f.offsetDeg) <= AMPLITUDE_NOTE_HALF_ANGLE_DEG,
  );
  const nbCentraux = faisceauxCentraux.length; // dénominateur dynamique (cône central, jamais un littéral)

  const nbDegages = faisceauxCentraux.filter(estDegage).length;
  const pourcentageFaisceauxDegages = nbDegages / nbCentraux;
  const amplitudePartA = AMPLITUDE_PART_A_PTS * pourcentageFaisceauxDegages;

  const moyenneProfondeurM =
    faisceauxCentraux.reduce((acc, f) => acc + profondeur(f), 0) / nbCentraux;
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

  // Amplitude BRUTE = Part A + Part B (PUR dégagement, Résultat A).
  const amplitude = amplitudePartA + amplitudePartB;

  // TODO migration Couche 1 B — flanc, ne pas supprimer.
  // QUARANTAINE : la pénalité de flanc n'est PLUS appliquée au Résultat A (pur dégagement).
  // `diviseurFlanc` est conservée mais N'EST PLUS APPELÉE ; la logique (flancs gauche/droit,
  // paliers ÷2/÷3, double flanc → 0) sera ré-activée dans la Couche 1 du Résultat B.
  const penaliteFlancAppliquee = false; // neutralisé (flanc hors Résultat A)

  // TODO migration Couche 1 B — orientation, ne pas supprimer.
  // QUARANTAINE : l'orientation est CALCULÉE (pour information / detail) mais EXCLUE du total A.
  // Le mapping ORIENTATION_PTS + bonus dernier étage sera réintégré dans la Couche 1 du Résultat B.
  const secteurOrientation = azimutVersSecteur(entree.orientationAzimutDeg);
  const baseOrientation = ORIENTATION_PTS[secteurOrientation];
  const maxOrientation = Math.max(...Object.values(ORIENTATION_PTS)); // plafond = meilleur secteur
  const bonusDernierEtage =
    entree.dernierEtage && baseOrientation < maxOrientation ? TOP_FLOOR_BONUS : 0;
  const orientation = clamp(baseOrientation + bonusDernierEtage, 0, maxOrientation);

  return {
    // Résultat A = PUR DÉGAGEMENT (distance + amplitude). Orientation + flanc → Couche 1 B.
    total: distance + amplitude,
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
