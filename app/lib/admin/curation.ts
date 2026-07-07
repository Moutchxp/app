/**
 * Constantes de la CURATION patrimoine (carte admin — étape 9 / M4).
 *
 * ISOLATION (invariant SVAV) : ces constantes pilotent UNIQUEMENT les endpoints CRUD de curation.
 * Elles n'appartiennent PAS à `app/lib/svv/config.ts` (config MOTEUR, isolée) : le moteur est
 * `cleabs`-only et ne lit ni `geom_point_corrige` ni ces bornes. Aucune valeur magique dispersée.
 */

/**
 * Rayon MAXIMAL (mètres, Lambert-93/2154) d'un déplacement manuel de point patrimoine autour de
 * son `geom_point` d'origine (décision Arno n°2, OQ-B). Au-delà → refus 422, rien écrit. Échelle
 * d'un îlot ; ajustable ici sans toucher au moteur.
 */
export const CURATION_DEPLACEMENT_RAYON_MAX_M = 150;

/** Message de refus quand la position demandée dépasse le rayon borné. */
export const MESSAGE_RAYON_DEPASSE = `Déplacement refusé : au-delà de ${CURATION_DEPLACEMENT_RAYON_MAX_M} m du point d'origine.`;

/** Message de refus quand l'entité n'a aucun point d'ancrage (`geom_point` NULL). */
export const MESSAGE_SANS_ANCRE = "Déplacement impossible : l'entité n'a pas de point d'ancrage.";
