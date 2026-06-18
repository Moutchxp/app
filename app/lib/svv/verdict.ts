/**
 * Moteur de verdict géométrique Sans Vis-à-Vis® — LOGIQUE PURE.
 *
 * AUCUNE donnée IGN, AUCUNE BDD, AUCUNE lecture LiDAR : le moteur est totalement
 * découplé de l'extraction de hauteur. Il consomme une liste d'obstacles
 * candidats DÉJÀ résolus (distance + altitude de sommet) et rend le verdict.
 *
 * Règles figées :
 *  - Le label ne dépend QUE de la géométrie (CLAUDE.md §2, §3).
 *  - Premier obstacle réel ≥ 40 m → Sans Vis-à-Vis (seuil = THRESHOLD_M).
 *  - Aucun arrondi (CLAUDE.md §5) : comparaisons sur valeurs brutes.
 *  - État INDÉTERMINÉ (SPEC_module_hauteurs_v3.md §6) : un bâtiment de hauteur
 *    inconnue (NONE) à < 40 m rencontré AVANT tout obstacle réel confirmé rend
 *    le verdict non certifiable. Un NONE à ≥ 40 m ne déclenche pas INDÉTERMINÉ.
 *
 * La végétation n'est jamais un obstacle : elle est exclue EN AMONT, donc les
 * candidats reçus ici sont uniquement des constructions humaines.
 */
import { THRESHOLD_M } from './config';

export type Verdict = 'SANS_VIS_A_VIS' | 'VIS_A_VIS' | 'INDETERMINE';

export type SourceHauteur = 'LIDAR_HD' | 'BD_TOPO' | 'NONE';

export interface ObstacleCandidat {
  /** Distance horizontale (m) depuis l'origine — Lambert-93, brute. */
  distanceM: number;
  /** Altitude du sommet (NGF, m). `null` si la hauteur est inconnue (source NONE). */
  altitudeSommetM: number | null;
  source: SourceHauteur;
}

export interface ResultatVerdict {
  verdict: Verdict;
  /** Distance retenue (m) ou `null` si aucun obstacle / non tranchable. */
  distanceM: number | null;
  /** Obstacle déterminant ou `null`. */
  obstacle: ObstacleCandidat | null;
  /** Explication courte et lisible du verdict. */
  raison: string;
}

/**
 * Détermine le premier obstacle réel dans l'axe et le verdict associé.
 *
 * Balayage du plus proche au plus loin (tri stable par distance croissante,
 * sans muter l'entrée).
 */
export function premierObstacle(
  candidats: ObstacleCandidat[],
  altitudeFenetreM: number,
): ResultatVerdict {
  const tries = [...candidats].sort((a, b) => a.distanceM - b.distanceM);

  for (const candidat of tries) {
    if (candidat.altitudeSommetM === null) {
      // Hauteur inconnue (source NONE).
      if (candidat.distanceM < THRESHOLD_M) {
        return {
          verdict: 'INDETERMINE',
          distanceM: candidat.distanceM,
          obstacle: candidat,
          raison: `Bâtiment de hauteur inconnue à ${candidat.distanceM} m (< ${THRESHOLD_M} m) avant tout obstacle confirmé : verdict non certifiable.`,
        };
      }
      // NONE à ≥ 40 m : sans effet sur le seuil, on continue.
      continue;
    }

    // Hauteur connue.
    if (candidat.altitudeSommetM >= altitudeFenetreM) {
      // Premier obstacle réel (sommet ≥ altitude de la fenêtre).
      const sansVisAVis = candidat.distanceM >= THRESHOLD_M;
      return {
        verdict: sansVisAVis ? 'SANS_VIS_A_VIS' : 'VIS_A_VIS',
        distanceM: candidat.distanceM,
        obstacle: candidat,
        raison: sansVisAVis
          ? `Premier obstacle réel à ${candidat.distanceM} m (≥ ${THRESHOLD_M} m) : sans vis-à-vis.`
          : `Premier obstacle réel à ${candidat.distanceM} m (< ${THRESHOLD_M} m) : vis-à-vis détecté.`,
      };
    }
    // Sommet sous la fenêtre : ne crée pas de vis-à-vis, on continue.
  }

  // Balayage terminé sans obstacle réel confirmé ni zone indéterminée.
  return {
    verdict: 'SANS_VIS_A_VIS',
    distanceM: null,
    obstacle: null,
    raison: `Aucun obstacle réel dans la portée d'analyse : sans vis-à-vis.`,
  };
}
