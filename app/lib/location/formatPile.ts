/**
 * ══ 🔴🔴 Arno (28/11/2026, 10h35) — LA PILE DE CARTOUCHES À SA TAILLE NORMALE SI LA LIGNE LE PERMET ═══════════════════════════════════════════════
 * « prioriser l'affichage à l'échelle normale des cartouches si l'espace du bloc locataire le permet, sinon les réduire comme aujourd'hui […] adapter
 * dynamiquement leur format à ce que permet l'espace du bloc locataire. » Taille normale par défaut, quel que soit le nombre de cartouches ; le format
 * réduit (`psl-pile--serree`, inchangé) seulement si, en taille normale :
 *   · la pile ALLONGERAIT la ligne (adresse, noms, préavis) — la ligne ne s'allonge jamais juste pour garder la taille normale ;
 *   · un cartouche SORTIRAIT de sa colonne (il couperait ou chevaucherait « Ouvrir ») ;
 *   · un texte de la ligne serait TRONQUÉ alors qu'il ne l'est pas en format réduit (« confié à … » n'est jamais sacrifié).
 * Mesure réelle, à l'affichage. Sans `pg`.
 */
export const CLASSE_PILE_REDUITE = 'psl-pile--serree';
export type FormatPile = 'normal' | 'reduit';
export interface MesurePile { hauteur: number; deborde: boolean; tronques: number }

/** Le format, d'après la ligne mesurée avec la pile en taille normale puis réduite (½ pixel de tolérance d'arrondi). PUR. */
export function formatSelonMesures(normale: MesurePile, reduite: MesurePile): FormatPile {
  return normale.hauteur > reduite.hauteur + 0.5 || normale.deborde || normale.tronques > reduite.tronques ? 'reduit' : 'normal';
}

/** Un cartouche de la pile dépasse-t-il de sa colonne (le conteneur de la pile) ? */
function pileDeborde(pile: HTMLElement): boolean {
  const cellule = pile.parentElement;
  if (cellule === null) return false;
  const c = cellule.getBoundingClientRect();
  for (const e of pile.querySelectorAll<HTMLElement>('*')) {
    const r = e.getBoundingClientRect();
    if (r.width > 0 && (r.left < c.left - 0.5 || r.right > c.right + 0.5)) return true;
  }
  return false;
}
/** Le nombre de textes tronqués (contenu plus large que sa boîte) dans le bloc de texte de la ligne. */
function textesTronques(ligne: HTMLElement): number {
  let n = 0;
  for (const e of ligne.querySelectorAll<HTMLElement>('.pva-textes *')) if (e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1) n += 1;
  return n;
}
const mesurer = (pile: HTMLElement, ligne: HTMLElement): MesurePile =>
  ({ hauteur: ligne.getBoundingClientRect().height, deborde: pileDeborde(pile), tronques: textesTronques(ligne) });

/**
 * Mesure, dans le DOM, la ligne avec la pile en taille normale puis réduite, et rend le format qui convient. La classe d'origine est remise avant
 * de rendre la main : rien n'est peint entre-temps (appel synchrone, avant l'affichage).
 */
export function mesurerFormatPile(pile: HTMLElement, ligne: HTMLElement): FormatPile {
  const avant = pile.classList.contains(CLASSE_PILE_REDUITE);
  pile.classList.remove(CLASSE_PILE_REDUITE);
  const normale = mesurer(pile, ligne);
  pile.classList.add(CLASSE_PILE_REDUITE);
  const reduite = mesurer(pile, ligne);
  pile.classList.toggle(CLASSE_PILE_REDUITE, avant);
  return formatSelonMesures(normale, reduite);
}
