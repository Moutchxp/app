/**
 * Clé du VERROU CONSULTATIF (pg advisory lock) de la veille Sitadel — SOURCE UNIQUE. `executerVeille` la prend au début de chaque
 * run (au plus un run à la fois, tous déclencheurs confondus) ; la relève DÉCLENCHÉE à la main par le dépôt téléservice (LOT 34)
 * la réutilise pour ne JAMAIS se superposer à un run ordinaire en cours. Un seul et même verrou → aucun second mécanisme.
 *
 * Constante EXTRAITE ici (et non dans executerVeille) pour être importée par `releveAuto.ts` SANS créer de cycle d'import
 * (executerVeille importe déjà releveAuto).
 */
export const CLE_VERROU_VEILLE = 776_920_011;
