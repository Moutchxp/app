'use client';

import { useEffect } from 'react';
import { couleurIllisibleSurFondSombre, fondClairImpose } from '../../../../lib/gestion/couleurSombre';

/**
 * ══ 🔴🔴 LOT SOMBRE-ET-RECHERCHE — RELEVER LE TEXTE SOMBRE, À L'ÉCRAN ET NULLE PART AILLEURS ════════════════
 *
 * ARNO (01/10/2026) : « À l'ÉCRAN, en thème Sombre uniquement : tout texte dont la couleur imposée est sombre
 * […] s'affiche en couleur de texte claire. Même règle pour les corps HTML des mails reçus et envoyés dans les
 * fils, et pour la visionneuse de mail. Les couleurs vives (rouge, liens, etc.) et les images ne sont jamais
 * modifiées. […] NE MODIFIE PAS le HTML envoyé ni stocké. »
 *
 * ═══ 🔴🔴 COMMENT LA PROMESSE « NI ENVOYÉ NI STOCKÉ » EST TENUE, MÉCANIQUEMENT ══════════════════════════════
 *
 * 🔴 ON N'ÉCRIT JAMAIS DANS L'ATTRIBUT `style`. `el.style.color = '#fff'` aurait mêlé NOTRE couleur à celles du
 * mail : impossible ensuite de distinguer ce que l'auteur a écrit de ce que nous avons ajouté — et un envoi
 * l'aurait emporté, en violation directe de la demande d'Arno.
 *
 * 🔴 CE QU'ON POSE EST UN ATTRIBUT DE DONNÉES VIDE (`data-svv-sombre`), qu'une seule règle CSS consomme. Il ne
 * porte aucune couleur, il est trivial à reconnaître, et il est RETIRÉ de toute remontée de contenu :
 * `htmlSansMarques` travaille sur une COPIE du conteneur, nettoyée, et c'est ce HTML-là que l'éditeur remonte.
 * Le corps qu'on enregistre et qu'on envoie ne porte donc pas une lettre de plus.
 *
 * 🔴 ET C'EST ÉPROUVÉ, pas seulement affirmé : un test remonte le contenu de l'éditeur en thème Clair puis en
 * thème Sombre, et exige deux chaînes IDENTIQUES au caractère près.
 *
 * ⚠️ LA RÈGLE « AUTOMATIQUE » RESTE EN VIGUEUR (aucun blanc imposé ne part dans un mail) : ce module ne produit
 * aucune couleur destinée à l'envoi, et le nettoyage ci-dessus garantit qu'il n'en produira jamais.
 */

/** L'attribut posé sur les éléments relevés. Sans valeur, retiré dès qu'on repasse en Clair, et jamais remonté. */
export const MARQUE = 'data-svv-sombre';

/** Les conteneurs de HTML de courrier. Un seul endroit qui les nomme — ils doivent tous se comporter pareil. */
export const CONTENEURS = '.cnv-html, .edr-zone, .gst-msg-corps';

/** Le thème est-il sombre À CET INSTANT ? Lu sur le DOM réel — `system` dépend du réglage du système. */
export function sombreMaintenant(racine: Element | null): boolean {
  const pref = racine?.getAttribute('data-theme') ?? 'system';
  if (pref === 'dark') return true;
  if (pref === 'light') return false;
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * ══ 🔴 LA PASSE : ON REGARDE, ON MARQUE, ON NE RÉÉCRIT RIEN ════════════════════════════════════════════════
 *
 * Pour chaque élément du conteneur : si sa couleur CALCULÉE est sombre et terne, et qu'aucun ancêtre ne lui
 * impose un fond clair, on pose la marque. Le CSS fait le reste.
 *
 * ⚠️ ON LIT `getComputedStyle`, PAS L'ATTRIBUT `style`. Une couleur peut venir d'un `<font color>`, d'une classe
 * du mail, d'un `style` en ligne ou d'un héritage : seule la couleur calculée les connaît toutes.
 *
 * ⚠️ UN FOND CLAIR IMPOSÉ ARRÊTE TOUT, sur l'élément comme sur ses ancêtres. Un bloc « background:#fff » avec
 * du texte noir se lit très bien en thème Sombre ; relever son texte le rendrait BLANC SUR BLANC. La correction
 * ne doit jamais rendre illisible ce qui ne l'était pas.
 *
 * ⚠️ LES IMAGES NE SONT JAMAIS TOUCHÉES : on ne pose la marque que sur des éléments qui portent du texte, et la
 * règle CSS ne parle que de `color`. Arno le demande explicitement.
 */
export function releverDans(conteneur: Element): void {
  const elements = [conteneur, ...Array.from(conteneur.querySelectorAll('*'))];
  for (const el of elements) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.tagName === 'IMG' || el.tagName === 'SVG' || el.tagName === 'VIDEO') continue;
    const calcule = window.getComputedStyle(el);
    if (fondClairSurLaBranche(el, conteneur)) { el.removeAttribute(MARQUE); continue; }
    if (couleurIllisibleSurFondSombre(calcule.color)) el.setAttribute(MARQUE, '');
    else el.removeAttribute(MARQUE);
  }
}

/** Retire toute trace de la passe. Appelé en repassant en Clair, et avant toute remontée de contenu. */
export function nettoyerDans(conteneur: Element): void {
  for (const el of Array.from(conteneur.querySelectorAll(`[${MARQUE}]`))) el.removeAttribute(MARQUE);
  conteneur.removeAttribute(MARQUE);
}

/**
 * 🔴 LE HTML TEL QU'IL PARTIRA : sans une seule trace de la passe d'affichage.
 *
 * ⚠️ ON TRAVAILLE SUR UNE COPIE. Nettoyer le vrai conteneur ferait clignoter l'écran à chaque frappe — et, pire,
 * laisserait l'éditeur en clair une fraction de seconde après chaque remontée.
 */
export function htmlSansMarques(conteneur: Element): string {
  const copie = conteneur.cloneNode(true) as Element;
  nettoyerDans(copie);
  return copie.innerHTML;
}

/** Un ancêtre (jusqu'au conteneur) impose-t-il un fond clair ? */
function fondClairSurLaBranche(el: HTMLElement, conteneur: Element): boolean {
  let courant: HTMLElement | null = el;
  for (let garde = 0; courant !== null && garde < 32; garde += 1) {
    if (fondClairImpose(window.getComputedStyle(courant).backgroundColor)) return true;
    if (courant === conteneur) break;
    courant = courant.parentElement;
  }
  return false;
}

/**
 * LE STYLE — posé une fois par l'écran qui monte les conteneurs.
 *
 * 🔴 `!important` ICI, ET SEULEMENT ICI : c'est le seul moyen de passer devant un `style="color:#000"` écrit
 * dans le mail. Il est borné à ce qui porte la marque, donc à ce que la passe a explicitement jugé illisible.
 */
export const CSS_LISIBILITE_SOMBRE = `
[${MARQUE}]{color:var(--color-svv-ink) !important}
`;

/**
 * ══ 🔴 LA PASSE, BRANCHÉE SUR UN CONTENEUR VIVANT ═══════════════════════════════════════════════════════════
 *
 * Elle se rejoue à trois moments, et il faut les trois :
 *   ① au montage et à chaque changement du contenu (`versions`) — un mail qu'on déplie, une signature insérée ;
 *   ② à chaque bascule de thème — l'attribut `data-theme` change sur la racine, sans que le contenu bouge ;
 *   ③ quand le système bascule, si le thème est réglé sur « Système ».
 *
 * ⚠️ ET ELLE NETTOIE EN THÈME CLAIR. Sans cela, une bascule Sombre → Clair laisserait des marques derrière elle,
 * et le `!important` du CSS ne serait plus là pour les rendre inoffensives.
 *
 * ⚠️ APRÈS LA PEINTURE (`requestAnimationFrame`) : `getComputedStyle` juste après un rendu React rendrait les
 * couleurs d'AVANT, et la passe jugerait un état qui n'existe plus.
 */
export function useLisibiliteSombre(
  ref: { current: Element | null },
  versions: readonly unknown[] = [],
): void {
  useEffect(() => {
    const zone = ref.current;
    if (zone === null || typeof window === 'undefined') return undefined;

    const passer = (): void => {
      const racine = document.querySelector('.svv-adm-root');
      if (sombreMaintenant(racine)) releverDans(zone);
      else nettoyerDans(zone);
    };
    const differer = (): void => {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(passer);
      else passer();
    };
    differer();

    /* ② LA BASCULE DE THÈME : `data-theme` change sur la racine, le contenu ne bouge pas. Sans cet observateur,
       il faudrait rouvrir le mail pour que la correction s'applique. */
    const racine = document.querySelector('.svv-adm-root');
    const obs = racine !== null && typeof MutationObserver === 'function'
      ? new MutationObserver(differer) : null;
    obs?.observe(racine as Node, { attributes: true, attributeFilter: ['data-theme'] });

    /* ③ LE RÉGLAGE « SYSTÈME » : c'est l'ordinateur qui bascule, et aucun attribut ne change chez nous. */
    const media = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    media?.addEventListener?.('change', differer);

    return () => {
      obs?.disconnect();
      media?.removeEventListener?.('change', differer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `versions` EST la liste de dépendances voulue.
  }, [ref, ...versions]);
}
