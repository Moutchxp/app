/**
 * ══ 🔴🔴 LOT BROUILLON-REPONSE-ET-REPERE — LES MOTS DU « BROUILLON EN ATTENTE ». Module PUR. ═════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (03/10/2026) : « PICTO “BROUILLON EN ATTENTE” (un petit crayon ou une feuille, aria-label et bulle
 * “Brouillon de réponse en attente”) : sur la ligne du listing de la Réception et des autres dossiers, juste à
 * GAUCHE du bloc trombone / nombre / statut ; sur la ligne du mail concerné dans la liste des mails d'une
 * conversation ; en haut du mail ouvert, une mention “Brouillon de réponse en attente — voir en bas” qui fait
 * défiler jusqu'à la zone de réponse. »
 *
 * 🔴 TROIS ENDROITS, UN SEUL VOCABULAIRE. Trois chaînes écrites à trois endroits auraient fini par se contredire —
 * et c'est le texte le plus rassurant qu'on aurait cru. Elles vivent donc ici, et les trois écrans les lisent.
 *
 * ⚠️ LE PICTO N'EST JAMAIS SEUL À PORTER L'INFORMATION : il a un `aria-label` et une bulle, et là où la place le
 * permet le MOT « Brouillon » reste à côté. Un crayon seul ne se lit ni en niveaux de gris, ni au lecteur d'écran.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Le picto lui-même. Un crayon : c'est le geste d'écrire, pas celui de ranger. */
export const PICTO_BROUILLON = '✎';

/** Le nom du picto, pour la bulle et pour les lecteurs d'écran. Mot pour mot la demande d'Arno. */
export const AIDE_BROUILLON_EN_ATTENTE = 'Brouillon de réponse en attente';

/**
 * LA MENTION EN HAUT DU MAIL OUVERT, et ce qu'elle promet.
 *
 * ⚠️ « VOIR EN BAS » EST UNE PROMESSE QUE L'ÉCRAN TIENT : le clic fait défiler jusqu'à la zone de réponse. Une
 * mention qui dirait où regarder sans y emmener ferait chercher.
 */
export const MENTION_BROUILLON_VOIR_EN_BAS = 'Brouillon de réponse en attente — voir en bas';
