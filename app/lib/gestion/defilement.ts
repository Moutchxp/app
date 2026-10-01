/**
 * ══ 🔴🔴 LOT MODALE-SUIVI-ET-DEFILEMENT (point 2) — DIRE QU'IL Y A ENCORE DU CONTENU EN DESSOUS ════════════════
 *
 * DEMANDE D'ARNO (02/10/2026) : « Quand la liste des propositions (et celle des résultats de recherche) contient
 * plus que ce qui est visible : en bas de la zone, une petite pastille ronde centrée avec une flèche vers le bas,
 * posée sur un léger dégradé de fondu du contenu. […] Elle disparaît dès que le bas de la liste est atteint, et
 * réapparaît si on remonte. Un clic fait défiler en douceur d'environ une hauteur de zone. »
 *
 * ═══ POURQUOI UN MODULE PUR POUR SI PEU ═════════════════════════════════════════════════════════════════════════
 *
 * Parce que « le bas est-il atteint ? » est une question piégeuse, et qu'elle se pose à deux endroits (la liste
 * des propositions, celle des résultats). Un défilement ne tombe presque jamais sur un compte rond : les
 * navigateurs rendent des hauteurs FRACTIONNAIRES, et `scrollTop + clientHeight` vaut couramment
 * `scrollHeight - 0,5`. Une comparaison stricte laisserait donc la pastille allumée en bas de liste, à clignoter
 * sans jamais s'éteindre — le genre de défaut qu'on ne voit qu'à l'écran, et qu'on ne sait pas reproduire.
 *
 * 🔴 AUCUN IMPORT, AUCUN DOM : ce fichier décide, le composant mesure et peint.
 */

/**
 * LA MARGE D'INDIFFÉRENCE, en pixels. En dessous, on considère que le bas est atteint.
 *
 * ⚠️ 4 px ET NON 0 : voir l'encadré — les hauteurs sont fractionnaires, et un zoom de navigateur à 110 % suffit à
 * faire apparaître un reliquat de deux pixels qui n'existe pour personne.
 */
export const MARGE_BAS = 4;

/** Une zone défilante, réduite aux trois nombres que le navigateur en donne. */
export interface MesureDefilement {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/**
 * RESTE-T-IL QUELQUE CHOSE À VOIR EN DESSOUS ? PUR.
 *
 * 🔴 DEUX QUESTIONS EN UNE, et il faut les deux : la zone DÉBORDE-t-elle (sinon il n'y a rien à annoncer), et
 * n'est-on PAS DÉJÀ EN BAS. Une liste qui tient entièrement dans sa zone ne porte jamais de pastille.
 */
export function resteEnDessous(m: MesureDefilement): boolean {
  const deborde = m.scrollHeight - m.clientHeight > MARGE_BAS;
  if (!deborde) return false;
  return m.scrollHeight - (m.scrollTop + m.clientHeight) > MARGE_BAS;
}

/**
 * DE COMBIEN LE CLIC FAIT-IL DESCENDRE ? « environ une hauteur de zone » (Arno). PUR.
 *
 * ⚠️ UN PEU MOINS QU'UNE HAUTEUR PLEINE : on garde quelques lignes communes entre l'avant et l'après, sans quoi on
 * perd le fil de ce qu'on lisait. C'est la règle de toute pagination à l'écran, et elle vaut ici aussi.
 */
export function sautDe(clientHeight: number): number {
  return Math.max(Math.round(clientHeight * 0.85), 40);
}

/** Le nom accessible de la pastille, écrit UNE fois : il est lu par les lecteurs d'écran et éprouvé par les essais. */
export const LIBELLE_PASTILLE = 'Voir les biens suivants';
