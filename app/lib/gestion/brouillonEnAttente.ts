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

/**
 * ══ 🔴🔴 LOT COMPTEURS-CORBEILLE-RECEPTION, POINT 2 — LA GRANDE CORBEILLE D'UN MESSAGE ═══════════════════════════
 *
 * RÈGLE D'ARNO (03/10/2026) : « aria-label et bulle “Mettre ce message à la corbeille” ».
 *
 * 🔴 « CE MESSAGE », ET NON « CET ÉCHANGE ». C'est toute la différence avec la corbeille d'une ligne de liste, et
 * une corbeille dessinée ne dit pas ce qu'elle jette : le mot, lui, le dit. Un seul endroit l'écrit, pour que la
 * bulle et le lecteur d'écran ne puissent pas diverger.
 */
export const AIDE_CORBEILLE_MESSAGE = 'Mettre ce message à la corbeille';

/** Le bandeau qui suit le geste, et qui le défait. Quelques secondes, puis il s'efface de lui-même. */
export const BANDEAU_MESSAGE_CORBEILLE = 'Message mis à la corbeille';

/**
 * Combien de temps le bandeau reste. « Quelques secondes » (Arno) : dix, le temps de lire la phrase et d'atteindre
 * « Annuler » sans se presser — et c'est déjà le délai du bandeau de l'éditeur. Un seul rythme dans tout le module.
 */
export const DELAI_BANDEAU_CORBEILLE_MS = 10_000;
