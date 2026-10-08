/**
 * ══ 🔴🔴 LOT FRISES-REPARATION, B — LES RÈGLES DE DÉFILEMENT D'UNE FRISE. MODULE PUR ═════════════════════════════
 *
 * Aucune base, aucun réseau, aucun React, aucun DOM. Des nombres entrent, des nombres sortent — et c'est ce qui
 * permet d'éprouver un défilement sans navigateur.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (06/10/2026) : « trackpad fluide avec inertie ; molette verticale convertie en horizontal
 * UNIQUEMENT tant que la frise peut défiler, puis la page reprend la main ; cliquer-tirer sans déclencher de
 * clic sur un carré ; flèches qui avancent d'environ un écran ; positionnement sur la dernière étape UNE SEULE
 * FOIS à l'ouverture, puis plus jamais ; un seul conteneur qui défile. […] Applique les MÊMES règles de
 * défilement à la frise des mails : même code, pas de second chemin. »
 *
 * ═══ 🔴🔴 LA CAUSE DE TOUT, MESURÉE AVANT D'ÉCRIRE UNE LIGNE ════════════════════════════════════════════════════
 *
 * Sur la frise d'avancement (lot-237, 82 px de défilement disponible), CHAQUE geste rendait **0** :
 *     molette verticale 0 · Maj+molette 0 · trackpad horizontal 0 · `scrollLeft = 9999` → **0**
 *     et `scrollBy({behavior:'smooth'})` → **0 après 1 200 ms**.
 *
 * La feuille portait `scroll-behavior: smooth` sur le conteneur. Avec cette propriété, TOUTE affectation de
 * `scrollLeft` devient une ANIMATION — et une animation est annulée par l'affectation suivante. Un gestionnaire
 * de molette ou de glisser, qui pose `scrollLeft` à chaque image, se bat donc contre lui-même : chaque trame
 * relance une animation que la suivante interrompt, et le résultat net est ZÉRO.
 *
 * 🔴 PREUVE : la même mesure, `scroll-behavior` forcé à `auto`, rend **82 à chaque geste** — le maximum.
 *
 * 🔴 D'OÙ LA RÈGLE DU MODULE : le défilement continu (molette, glisser) est TOUJOURS instantané ; seule une
 * flèche, qui est un saut voulu et unique, s'anime. C'est `COMPORTEMENT_CONTINU` / `COMPORTEMENT_SAUT`.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Ce qu'il faut savoir d'un conteneur pour décider. Les trois nombres que le DOM rend. */
export interface EtatDefilement {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}

/** De combien ce conteneur peut encore défiler, au total. */
export function restePossible(e: EtatDefilement): number {
  return Math.max(0, e.scrollWidth - e.clientWidth);
}

/**
 * 🔴 PEUT-IL ENCORE ALLER DANS CE SENS ? C'est la question qui décide si la frise garde la main ou la rend à la
 * page. Une marge d'un pixel : les navigateurs rendent `scrollLeft` fractionnaire, et une comparaison stricte
 * laisserait la frise s'accrocher à un demi-pixel de défilement restant.
 */
export function peutDefiler(e: EtatDefilement, sens: -1 | 1): boolean {
  if (sens < 0) return e.scrollLeft > 1;
  return e.scrollLeft < restePossible(e) - 1;
}

/**
 * ══ 🔴🔴 LA MOLETTE — SEUL LE GESTE HORIZONTAL DÉPLACE LE RUBAN ══════════════════════════════════════════════════
 *
 * ARNO (08/10/2026, lot RUBANS-SCROLL-HORIZONTAL…) : « Aujourd'hui, quand le curseur est posé sur l'un d'eux, le
 * défilement VERTICAL (molette haut/bas, deux doigts haut/bas) fait défiler le ruban → la page se bloque.
 * Voulu : seul le défilement HORIZONTAL déplace le ruban. Le défilement VERTICAL n'est plus intercepté : il fait
 * défiler la PAGE ENTIÈRE, même curseur posé sur le ruban. »
 *
 * Deux intentions, et elles sont toutes les deux HORIZONTALES :
 *   · le TRACKPAD horizontal (`deltaX` dominant) — le ruban défile, et le navigateur garde son inertie ;
 *   · MAJ + molette — le geste conventionnel du défilement horizontal.
 *
 * ══ 🔴🔴 CE QUE CETTE FONCTION FAISAIT DE PLUS, ET POURQUOI C'EST RETIRÉ ═════════════════════════════════════════
 *
 * Une TROISIÈME branche convertissait la molette VERTICALE en défilement horizontal, « tant que la frise peut
 * défiler dans ce sens », et ne rendait la main à la page qu'en BUTÉE. L'intention était bonne — faire défiler un
 * ruban sans trackpad —, et la sortie en butée avait même été écrite exprès pour ne pas piéger le lecteur.
 *
 * 🔴 ELLE LE PIÉGEAIT QUAND MÊME, ET C'EST CE QU'ARNO DÉCRIT. Un ruban de quarante mois a plusieurs écrans de
 * défilement : pour dépasser la frise en lisant la fiche, il fallait d'abord la dérouler ENTIÈREMENT. La page
 * semblait bloquée — et au retour, le ruban avait perdu l'endroit qu'on regardait, sans qu'on l'ait demandé.
 *
 * ⚠️ `peutDefiler` RESTE, ET SERT TOUJOURS : les flèches ‹ › s'allument par elle (`bordsVisibles`). C'est la
 * CONVERSION qui disparaît, pas la mesure.
 *
 * ⚠️ UN GESTE HORIZONTAL NE REND JAMAIS LA MAIN À LA PAGE, même en butée : la page ne défile pas
 * horizontalement, et lui rendre un geste horizontal ne ferait rien du tout.
 */
export function defilementMolette(
  g: { deltaX: number; deltaY: number; shiftKey: boolean }, e: EtatDefilement,
): { dx: number; prendreLaMain: boolean } {
  const horizontal = Math.abs(g.deltaX) > Math.abs(g.deltaY);
  if (horizontal) return { dx: g.deltaX, prendreLaMain: true };
  if (g.shiftKey && g.deltaY !== 0) return { dx: g.deltaY, prendreLaMain: true };
  /* 🔴 LA MOLETTE VERTICALE N'EST PLUS INTERCEPTÉE : la page défile, curseur posé sur le ruban ou non. */
  return { dx: 0, prendreLaMain: false };
}

/**
 * 🔴 UNE FLÈCHE AVANCE D'ENVIRON UN ÉCRAN (Arno). Pas tout à fait : on garde un peu de recouvrement, pour qu'un
 * repère commun reste visible entre avant et après — sans quoi on perd le fil de ce qu'on regardait.
 *
 * ⚠️ UN PLANCHER : sur une frise très étroite, 90 % de rien ne déplacerait rien.
 */
export const RECOUVREMENT = 0.9;
export const PAS_MINIMAL = 120;

export function pasDUnEcran(clientWidth: number): number {
  return Math.max(PAS_MINIMAL, Math.round(clientWidth * RECOUVREMENT));
}

/**
 * ══ 🔴 LE GLISSER, ET LE CLIC QU'IL NE DOIT PAS AVALER ═══════════════════════════════════════════════════════════
 *
 * Arno : « cliquer-tirer sans déclencher de clic sur un carré ».
 *
 * 🔴 DEUX DÉCISIONS, UN SEUL SEUIL — ET C'EST VOULU. La première : quand le GLISSER commence (au-delà de
 * quelques pixels, sinon un clic net, qui tremble toujours d'un pixel ou deux, serait avalé par un déplacement
 * de zéro). La seconde, celle qui MANQUAIT : le clic qui suit doit-il être ANNULÉ ? Les deux partagent
 * `SEUIL_GLISSER`, et l'égalité est la règle : **tout glisser qui a réellement déplacé la frise avale son
 * clic**, et lui seul. Deux seuils différents laisseraient une bande de pixels où la frise bouge ET où le
 * carré qu'on a effleuré en la poussant s'ouvre — exactement ce qu'Arno ne veut plus.
 */
export const SEUIL_GLISSER = 4;

export function glisserCommence(deplacement: number): boolean {
  return Math.abs(deplacement) >= SEUIL_GLISSER;
}

/** Le clic qui suit ce glisser doit-il être annulé ? Dès que la frise a bougé, oui. */
export function clicAAvaler(deplacementTotal: number): boolean {
  return Math.abs(deplacementTotal) >= SEUIL_GLISSER;
}

/**
 * ══ 🔴🔴 LE COMPORTEMENT DE DÉFILEMENT, SELON CE QU'ON FAIT ══════════════════════════════════════════════════════
 *
 * 🔴 C'EST LA CORRECTION CENTRALE DU POINT B. Un défilement CONTINU (molette, glisser) doit être instantané :
 * animé, chaque trame annule la précédente et rien ne bouge — mesuré à 0 sur tous les gestes. Un SAUT voulu
 * (une flèche, le calage d'ouverture) peut s'animer : il est unique, rien ne vient l'interrompre.
 *
 * ⚠️ ET `scroll-behavior` NE DOIT PLUS ÊTRE DANS LA FEUILLE : posé en CSS, il s'applique à TOUT, y compris au
 * continu. C'est là qu'était le défaut.
 *
 * ⚠️ `'instant'` ET NON `'auto'`, ET LA NUANCE COMPTE. Par la spécification, `behavior:'auto'` signifie
 * « applique le `scroll-behavior` CSS de l'élément » — donc, sur une feuille qui dirait `smooth`, il s'animerait
 * quand même. `'instant'` l'ignore. Le défilement continu ne peut pas dépendre d'une feuille de style qu'un
 * lot futur rouvrirait.
 */
export const COMPORTEMENT_CONTINU: ScrollBehavior = 'instant';
export const COMPORTEMENT_SAUT: ScrollBehavior = 'smooth';

/**
 * CE QUE LES FLÈCHES DOIVENT MONTRER, aux deux bouts. Pur, pour que les deux frises répondent pareil.
 *
 * ⚠️ LA MÊME MARGE D'UN PIXEL QUE `peutDefiler` : une flèche qui clignote à chaque pixel de défilement apprend
 * à ne plus regarder les flèches.
 */
export function bordsVisibles(e: EtatDefilement): { gauche: boolean; droite: boolean } {
  return { gauche: peutDefiler(e, -1), droite: peutDefiler(e, 1) };
}
