/**
 * MODULE « GESTION » — clé du VERROU CONSULTATIF (pg advisory lock) de la relève de gestion. SOURCE UNIQUE.
 *
 * 🔴 CLÉ PROPRE, JAMAIS `CLE_VERROU_VEILLE`. Partager le verrou du module Permis ferait qu'une relève de gestion lente
 * retarderait la veille Sitadel — et inversement. Deux métiers, deux verrous : ni l'un ni l'autre n'attend son voisin.
 * Valeur choisie hors de portée de celle de la veille (776 920 011), et gravée ici une seule fois.
 */
export const CLE_VERROU_GESTION = 776_920_022;
