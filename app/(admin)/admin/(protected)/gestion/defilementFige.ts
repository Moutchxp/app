/**
 * ══ 🔴🔴 LOT FILTRE-ECRAN-FIXE (Arno, 13/10/2026) — L'ÉCRAN RESTE FIXE AU CHANGEMENT DE FILTRE ══════════════════════
 *
 * Constat d'Arno : un filtre sans résultat faisait remonter l'écran (la page raccourcissait sous lui, le navigateur
 * ramenait le défilement), un filtre avec résultats non. Choix d'Arno : l'écran RESTE FIXE.
 *
 * Deux gestes, et il faut les deux :
 *   ① `figerDefilement` note, AVANT le changement, la position de chaque ancêtre qui défile (et de la fenêtre), et
 *     rend de quoi la RÉTABLIR après le rendu — le navigateur ne peut donc rien déplacer en douce ;
 *   ② la zone de la liste ne descend jamais sous la plus grande hauteur atteinte depuis l'ouverture de l'écran
 *     (`hauteurRetenue`) : la page ne se rétracte pas sous l'utilisateur. Remise à zéro au rechargement (état React).
 *
 * Aucun réseau, aucune base. Navigateur seulement.
 */

/** Note la position de défilement des ancêtres de `depuis` (et de la fenêtre) ; rend la fonction qui la rétablit. */
export function figerDefilement(depuis: Element | null): () => void {
  const pris: { el: Element; haut: number }[] = [];
  for (let e = depuis?.parentElement ?? null; e !== null; e = e.parentElement) {
    if (e.scrollTop !== 0) pris.push({ el: e, haut: e.scrollTop });
  }
  const x = typeof window === 'undefined' ? 0 : window.scrollX;
  const y = typeof window === 'undefined' ? 0 : window.scrollY;
  return () => {
    for (const p of pris) if (p.el.scrollTop !== p.haut) p.el.scrollTop = p.haut;
    if (typeof window !== 'undefined' && (window.scrollX !== x || window.scrollY !== y)) window.scrollTo?.(x, y);
  };
}

/** La hauteur minimale de la zone : la plus grande déjà occupée (jamais moins). PUR. */
export function hauteurRetenue(maxPrecedent: number, mesure: number): number {
  return Math.max(maxPrecedent, Math.ceil(mesure));
}

export const MOT_AUCUNE_TACHE_FILTRE = 'Aucune tâche pour ce filtre';
