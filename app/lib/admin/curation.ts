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

/**
 * Tolérance (mètres, 2154) entre le point effectif et l'emprise d'une liaison AU-DELÀ de laquelle un
 * déplacement INVALIDE la vérification manuelle de cette liaison (décision Arno). Miroir de la tolérance
 * de rattachement AUTO (15 m) : un petit recentrage (< 15 m du bâti) CONSERVE la vérification, seul un
 * vrai éloignement (> 15 m) la remet à `false`. Test par distance (les points géocodés sont normalement
 * HORS de l'emprise), PAS par containment strict qui invaliderait la quasi-totalité des liaisons.
 */
export const CURATION_TOLERANCE_RATTACHEMENT_M = 15;
