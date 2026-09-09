/**
 * RECENTRAGE-1 — au CLIC sur une pièce (liste « voir toutes les pièces »), deux mouvements d'AFFICHAGE seulement (aucune logique
 * d'ouverture, aucun état, aucune navigation ne change) :
 *   ① la vue de la fenêtre se recentre sur la LISEUSE (l'internaute voit l'image, pas l'en-tête de page) ;
 *   ② le défilement INTERNE de la liste se recale pour que la pièce choisie soit en 2ᵉ position (une pièce visible au-dessus).
 * Défilement DOUX, mais INSTANTANÉ sous `prefers-reduced-motion` (exigence projet). Les deux mouvements portent sur des conteneurs de
 * défilement DISTINCTS (la fenêtre pour ①, la liste bornée pour ②) → ils ne se gênent pas et sont déclenchés dans le même rAF.
 */

/** Préférence système « mouvement réduit ». SSR-safe (jamais d'accès window au rendu ; appelé dans un handler/rAF, côté client). */
export function mouvementReduit(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * ② PUR — cible de défilement INTERNE (scrollTop) pour placer un item en 2ᵉ position : on laisse UNE hauteur d'item au-dessus de lui.
 * Cas limites tranchés par Arno :
 *   · liste trop courte pour défiler (maxScroll ≤ 0) → `null` (ne rien faire) ;
 *   · 1ʳᵉ pièce (item collé en haut) → cible brute ≤ 0 → clampée à 0 (elle RESTE en 1ʳᵉ position) ;
 *   · fin de liste (pas assez d'items en dessous) → clampée au défilement max (la pièce reste visible, au plus près de la 2ᵉ position).
 * `itemTopDansConteneur` = distance du haut de l'item au haut du CONTENU défilable (indépendante du scroll courant).
 */
export function cibleDeuxiemePosition(itemTopDansConteneur: number, hauteurItem: number, scrollHeight: number, clientHeight: number): number | null {
  const maxScroll = scrollHeight - clientHeight;
  if (maxScroll <= 0) return null;                                    // trop court pour défiler → on ne force jamais
  const brut = itemTopDansConteneur - hauteurItem;                   // une hauteur d'item au-dessus → 2ᵉ position
  return Math.max(0, Math.min(brut, maxScroll));                     // 1ʳᵉ pièce → 0 ; fin de liste → maxScroll
}

/** ① DOM — recentre la fenêtre sur l'élément liseuse (doux, ou instantané si mouvement réduit). No-op si l'élément n'est pas monté. */
export function recentrerSurLiseuse(el: HTMLElement | null, reduit: boolean = mouvementReduit()): void {
  if (!el || typeof el.scrollIntoView !== 'function') return;
  el.scrollIntoView({ behavior: reduit ? 'auto' : 'smooth', block: 'center', inline: 'nearest' });
}

/**
 * ② DOM — recale le défilement INTERNE de la liste (conteneur borné) pour que la pièce (repérée par `data-piece-id`) soit en 2ᵉ position.
 * Une pièce multi-catégories apparaît plusieurs fois : on vise la PREMIÈRE occurrence (la plus haute), repère stable. No-op si absente.
 *
 * ⚠️ DÉFILEMENT INSTANTANÉ (jamais 'smooth') — C'EST le « ne doivent pas se gêner » d'Arno : un défilement DOUX de ce conteneur borné est
 *   ANNULÉ dès qu'il coexiste avec le recentrage DOUX de la fenêtre (①), et se révèle non fiable même seul sur cet écran (re-render). Le
 *   mouvement est de toute façon IMPERCEPTIBLE : pendant ①, la liste défile HORS CHAMP → quand l'internaute y revient, elle est déjà calée.
 *   La « douceur » demandée reste portée par ① (le seul mouvement réellement vu). reduced-motion : ① aussi devient instantané.
 */
export function placerPieceDeuxieme(conteneur: HTMLElement | null, pieceId: number): void {
  if (!conteneur || typeof conteneur.scrollTo !== 'function') return;
  const item = conteneur.querySelector<HTMLElement>(`[data-piece-id="${pieceId}"]`);
  if (!item) return;
  const cRect = conteneur.getBoundingClientRect();
  const iRect = item.getBoundingClientRect();
  const itemTopDansConteneur = (iRect.top - cRect.top) + conteneur.scrollTop; // position dans le CONTENU, indépendante du scroll courant
  const cible = cibleDeuxiemePosition(itemTopDansConteneur, iRect.height, conteneur.scrollHeight, conteneur.clientHeight);
  if (cible === null) return;
  conteneur.scrollTo({ top: cible, behavior: 'auto' }); // instantané, fiable (cf. bloc ci-dessus)
}

/**
 * RECENTRAGE-1 — orchestration au clic sur une pièce, dans le MÊME rAF (le layout est stable — l'ordre des pièces ne change jamais) :
 *   ① recentrer la fenêtre sur la liseuse — DOUX (ou instantané si mouvement réduit) ;
 *   ② recaler la liste en 2ᵉ position — INSTANTANÉ (cf. placerPieceDeuxieme : sinon annulé par ①, et imperceptible car hors champ).
 * Les deux portent sur des conteneurs de défilement DISTINCTS et ne se gênent donc pas.
 */
export function recentrerSurSelectionPiece(liseuse: HTMLElement | null, liste: HTMLElement | null, pieceId: number): void {
  const reduit = mouvementReduit();
  const appliquer = () => { recentrerSurLiseuse(liseuse, reduit); placerPieceDeuxieme(liste, pieceId); };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(appliquer);
  else appliquer();
}
