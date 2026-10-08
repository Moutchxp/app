/**
 * ══ 🔴🔴 LOT FRISE-ORDRE-POSE-ET-GLISSER — DÉPLACER UNE CARTE À LA SOURIS. MODULE PUR. ══════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * ARNO (08/10/2026), points 8 et 9 :
 *   · « Une carte posée peut être saisie par CLIC MAINTENU et glissée à une autre place dans la frise ; au
 *     relâchement, sa nouvelle place est enregistrée. Le défilement de la frise (flèche ‹ ›) doit rester
 *     utilisable pendant le glisser. Un clic simple, le crayon et le menu “…” continuent de fonctionner comme
 *     avant (le glisser ne démarre qu'après un VRAI MAINTIEN + MOUVEMENT). »
 *   · « Ouverture, Clôture, Réouverture et Clôture Monga NE se déplacent PAS […] aucune carte ne peut être
 *     glissée avant l'Ouverture. »
 *
 * 🔴 POURQUOI UN MODULE À PART, ET PUR. Un glisser, c'est trois choses : un SEUIL (à partir de quand est-ce un
 * glisser et non un clic ?), une CIBLE (sur quelle place la carte tombe-t-elle ?) et un ORDRE (à quoi ressemble
 * la frise après ?). Les trois sont de l'arithmétique, et l'arithmétique s'éprouve sans navigateur. Ce qui reste
 * dans le composant est le branchement des événements de pointeur, et rien d'autre.
 *
 * ⚠️ AUCUN `window`, AUCUN `document`, AUCUN React ici : ce module est lu par un composant `'use client'`, et la
 * règle du dépôt depuis l'incident du 24/09/2026 est que tout ce qui peut être pur le soit.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * ══ 🔴🔴 LE SEUIL — CE QUI DISTINGUE UN CLIC D'UN GLISSER ═══════════════════════════════════════════════════════
 *
 * ARNO : « le glisser ne démarre qu'après un VRAI MAINTIEN + MOUVEMENT ». Les DEUX, et c'est ce qui protège les
 * trois gestes qui existaient avant : le clic simple sur la carte, le crayon, et le menu « … ».
 *
 * 🔴 220 ms, ET C'EST MESURÉ SUR CE QU'IL FAUT ÉVITER : un clic humain ordinaire dure 70 à 150 ms entre l'appui
 * et le relâchement. Au-dessous de 200 ms, un clic un peu appuyé déclencherait le glisser et la carte partirait
 * sous le doigt. Au-dessus de 300 ms, le glisser paraît « coincé » avant de démarrer.
 *
 * 🔴 ET 6 px DE MOUVEMENT, parce qu'un maintien seul n'est pas un glisser : on maintient aussi pour lire une
 * bulle. Six pixels est le seuil courant des bibliothèques de glisser (dnd-kit en met 8, le navigateur 5 pour un
 * `dragstart` natif) ; en dessous, un tremblement de main suffirait.
 *
 * ⚠️ LE SEUIL DE DISTANCE SE MESURE EN DISTANCE DE TCHEBYCHEV (le plus grand des deux écarts) et non en distance
 * euclidienne : c'est la même chose à un facteur √2 près, et cela évite une racine carrée à chaque image.
 */
export const MAINTIEN_MS = 220;
export const MOUVEMENT_PX = 6;

export function glisserDemarre(maintenuMs: number, dx: number, dy: number): boolean {
  return maintenuMs >= MAINTIEN_MS && Math.max(Math.abs(dx), Math.abs(dy)) >= MOUVEMENT_PX;
}

/** Une carte de la rangée, telle que le glisser a besoin de la connaître. */
export interface CarteGlissable {
  /** L'identifiant de l'étape. Les cartes non déplaçables en ont un aussi : elles occupent une place. */
  id: number;
  /** `false` pour les bornes et l'ouverture dérivée (Arno, point 9). */
  deplacable: boolean;
  /** Le centre horizontal de la carte, en pixels, dans le repère de la piste. */
  centre: number;
}

/**
 * ══ 🔴🔴 OÙ LA CARTE TOMBE-T-ELLE ? ═════════════════════════════════════════════════════════════════════════════
 *
 * On rend l'INDICE d'insertion dans la rangée : 0 = tout à gauche, `n` = tout à droite. La carte saisie est
 * retirée de la liste avant le calcul, de sorte que l'indice s'entend « parmi les autres ».
 *
 * 🔴 LA COMPARAISON PORTE SUR LE CENTRE DES CARTES, et non sur leurs bords : c'est ce qui fait qu'une carte
 * bascule quand on dépasse la moitié de sa voisine, et pas quand on l'effleure. Le geste devient prévisible.
 *
 * 🔴 LES PLACES INTERDITES SONT RABOTÉES À LA FIN (`bornerSurLesPlacesPermises`), jamais en cours de route : on
 * calcule d'abord où le doigt est, puis on répond où la carte PEUT aller. L'inverse aurait fait « sauter » le
 * repère dès qu'on approche d'une borne.
 */
export function placeVisee(autres: readonly CarteGlissable[], x: number): number {
  let i = 0;
  while (i < autres.length && x > autres[i].centre) i += 1;
  return i;
}

/**
 * ══ 🔴🔴 LES PLACES PERMISES (Arno, point 9) ════════════════════════════════════════════════════════════════════
 *
 * « Ouverture, Clôture, Réouverture et Clôture Monga NE se déplacent PAS ; aucune carte ne peut être glissée
 * avant l'Ouverture. »
 *
 * 🔴 CES DEUX PHRASES N'EN FONT QU'UNE, et c'est ce qui rend la règle simple : si les bornes ne bougent pas,
 * alors une carte déposée ne peut pas traverser une borne — elle sortirait la borne de sa place relative. Les
 * places permises sont donc celles de l'INTERVALLE entre la borne qui précède la carte et celle qui la suit.
 *
 * ⚠️ « AVANT L'OUVERTURE » EN DÉCOULE SANS ÊTRE ÉCRIT À PART : l'Ouverture est la première borne, et aucune
 * carte ne peut remonter au-dessus d'elle. Une règle écrite deux fois aurait fini par n'être vraie qu'une.
 *
 * ⚠️ `autres` EST LA RANGÉE SANS LA CARTE SAISIE : les indices rendus s'entendent dans cette liste-là.
 */
export function placesPermises(autres: readonly CarteGlissable[]): { min: number; max: number } {
  /* La dernière borne AVANT la carte saisie : on ne peut pas remonter au-dessus d'elle. */
  let min = 0;
  for (let i = 0; i < autres.length; i += 1) if (!autres[i].deplacable) min = i + 1; else break;
  /* La première borne APRÈS : on ne peut pas descendre en dessous d'elle. */
  let max = autres.length;
  for (let i = autres.length - 1; i >= 0; i -= 1) if (!autres[i].deplacable) max = i; else break;
  return { min, max: Math.max(min, max) };
}

/**
 * ══ 🔴🔴 LA RANGÉE APRÈS LE GLISSER ═════════════════════════════════════════════════════════════════════════════
 *
 * Rend la suite complète des identifiants, dans leur nouvel ordre — c'est exactement ce que la route attend
 * (`geste: 'ordre'`), et c'est idempotent : la rejouer donne le même résultat.
 *
 * ⚠️ `null` QUAND RIEN NE CHANGE, et l'appelant n'envoie alors rien. Un glisser qui repose la carte où elle
 * était ne doit pas écrire en base ni faire clignoter la frise.
 *
 * ⚠️ UNE CARTE NON DÉPLAÇABLE NE SE DÉPLACE PAS, même si l'appelant le demande : la garde est ici ET dans la
 * route, parce qu'une règle tenue d'un seul côté est contournée par le premier appel qui l'oublie.
 */
export function rangeeApresGlisser(
  rangee: readonly CarteGlissable[], saisie: number, x: number,
): number[] | null {
  const depart = rangee.findIndex((c) => c.id === saisie);
  if (depart === -1 || !rangee[depart].deplacable) return null;
  const autres = rangee.filter((c) => c.id !== saisie);
  const { min, max } = placesPermises(autres);
  const voulue = placeVisee(autres, x);
  const place = Math.min(Math.max(voulue, min), max);
  const apres = [...autres.slice(0, place).map((c) => c.id), saisie, ...autres.slice(place).map((c) => c.id)];
  const avant = rangee.map((c) => c.id);
  return apres.join(',') === avant.join(',') ? null : apres;
}
