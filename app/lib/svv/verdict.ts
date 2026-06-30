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
import { THRESHOLD_M, ANALYSIS_RANGE_M } from './config';

export type Verdict = 'SANS_VIS_A_VIS' | 'VIS_A_VIS' | 'INDETERMINE';

export type SourceHauteur = 'LIDAR_HD' | 'BD_TOPO' | 'NONE';

export interface ObstacleCandidat {
  /** Distance horizontale (m) depuis l'origine — Lambert-93, brute. */
  distanceM: number;
  /** Altitude du sommet (NGF, m). `null` si la hauteur est inconnue (source NONE). */
  altitudeSommetM: number | null;
  source: SourceHauteur;
  // --- Métadonnées d'enrichissement (Couche 1 du Résultat B) ---------------------------------
  // OPTIONNELLES et NULLABLES. NON lues par premierObstacle ni par le verdict (zéro impact sur A).
  // Renseignées côté BD TOPO (faisceaux de score) ; absentes côté LiDAR (verdict).
  /** cleabs BD TOPO du bâti (jointure F2 `bdnb_annee_batiment` <1900). */
  cleabs?: string | null;
  /** `bdtopo_batiment.nature` du bâti (F3 remarquable). */
  nature?: string | null;
  /** LineString origine→portée 200 m (SRID 2154) du faisceau (F4 traversée nature/eau). */
  rayonWkt?: string;
  /** Point d'impact sur le rayon (SRID 2154) = origine + dist·(sin,cos) (F2/F3). */
  impactPointWkt?: string | null;
}

export interface ResultatVerdict {
  verdict: Verdict;
  /** Distance retenue (m) ou `null` si aucun obstacle / non tranchable. */
  distanceM: number | null;
  /** Obstacle déterminant ou `null`. */
  obstacle: ObstacleCandidat | null;
  /** Explication courte et lisible du verdict. */
  raison: string;
  /**
   * Analyse dégradée (axe principal uniquement) : true si le verdict est
   * SANS_VIS_A_VIS mais qu'un bâtiment de hauteur inconnue (NONE) ≥ 40 m se
   * trouve dans la ligne de vue ouverte (devant l'obstacle confirmé, ou dans
   * la portée si vue dégagée). N'affecte jamais le verdict.
   */
  analyseDegradee: boolean;
  /** Message expliquant la dégradation, ou `null` si analyse non dégradée. */
  messageDegrade: string | null;
}

/** Calcule le signalement de dégradation (axe principal uniquement). */
function calculerDegradation(
  base: Omit<ResultatVerdict, 'analyseDegradee' | 'messageDegrade'>,
  candidats: ObstacleCandidat[],
): Pick<ResultatVerdict, 'analyseDegradee' | 'messageDegrade'> {
  if (base.verdict !== 'SANS_VIS_A_VIS') {
    return { analyseDegradee: false, messageDegrade: null };
  }

  const distanceObstacle = base.obstacle ? base.obstacle.distanceM : null;
  const nonesPertinents = candidats.filter(
    (c) =>
      c.source === 'NONE' &&
      c.distanceM >= THRESHOLD_M &&
      (distanceObstacle === null
        ? c.distanceM <= ANALYSIS_RANGE_M
        : c.distanceM < distanceObstacle),
  );

  if (nonesPertinents.length === 0) {
    return { analyseDegradee: false, messageDegrade: null };
  }

  const d = Math.min(...nonesPertinents.map((c) => c.distanceM));
  const autres = nonesPertinents.length - 1;
  const suffixe = autres > 0 ? ` (et ${autres} autre(s))` : '';
  return {
    analyseDegradee: true,
    messageDegrade: `Analyse dégradée : un bâtiment sans donnée de hauteur est présent dans l'axe de contrôle à ${d.toFixed(2)} m${suffixe}. Situé à 40 m ou plus, il n'empêche pas la certification Sans Vis-à-Vis, mais le résultat est dégradé.`,
  };
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

  // Détermine le résultat de base (verdict/distanceM/obstacle/raison, inchangé),
  // puis y ajoute le signalement de dégradation.
  const finaliser = (
    base: Omit<ResultatVerdict, 'analyseDegradee' | 'messageDegrade'>,
  ): ResultatVerdict => ({ ...base, ...calculerDegradation(base, candidats) });

  for (const candidat of tries) {
    if (candidat.altitudeSommetM === null) {
      // Hauteur inconnue (source NONE).
      if (candidat.distanceM < THRESHOLD_M) {
        return finaliser({
          verdict: 'INDETERMINE',
          distanceM: candidat.distanceM,
          obstacle: candidat,
          raison: `Bâtiment de hauteur inconnue à ${candidat.distanceM} m (< ${THRESHOLD_M} m) avant tout obstacle confirmé : verdict non certifiable.`,
        });
      }
      // NONE à ≥ 40 m : sans effet sur le seuil, on continue.
      continue;
    }

    // Hauteur connue.
    if (candidat.altitudeSommetM >= altitudeFenetreM) {
      // Premier obstacle réel (sommet ≥ altitude de la fenêtre).
      const sansVisAVis = candidat.distanceM >= THRESHOLD_M;
      return finaliser({
        verdict: sansVisAVis ? 'SANS_VIS_A_VIS' : 'VIS_A_VIS',
        distanceM: candidat.distanceM,
        obstacle: candidat,
        raison: sansVisAVis
          ? `Premier obstacle réel à ${candidat.distanceM} m (≥ ${THRESHOLD_M} m) : sans vis-à-vis.`
          : `Premier obstacle réel à ${candidat.distanceM} m (< ${THRESHOLD_M} m) : vis-à-vis détecté.`,
      });
    }
    // Sommet sous la fenêtre : ne crée pas de vis-à-vis, on continue.
  }

  // Balayage terminé sans obstacle réel confirmé ni zone indéterminée.
  return finaliser({
    verdict: 'SANS_VIS_A_VIS',
    distanceM: null,
    obstacle: null,
    raison: `Aucun obstacle réel dans la portée d'analyse : sans vis-à-vis.`,
  });
}
