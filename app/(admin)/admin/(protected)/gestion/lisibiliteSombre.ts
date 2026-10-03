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
 *
 * ═══ 🔴🔴 ELLE EFFACE SES PROPRES MARQUES AVANT DE MESURER — ET C'EST LA CORRECTION DU LOT ═══════════════════
 * ═══ EDITEUR-SIGNATURE-SOMBRE-ET-MINIATURES ═════════════════════════════════════════════════════════════════
 *
 * CONSTAT D'ARNO (03/10/2026) : « Nouveau message » en thème Sombre, la ligne « 2 rue Mars et Roty, 92800
 * Puteaux » de la signature reste NOIRE, alors que « Service Gestion » et les téléphones sont clairs.
 *
 * 🔴🔴 LA CAUSE, MESURÉE DANS LE NAVIGATEUR, EST QUE CETTE PASSE N'ÉTAIT PAS IDEMPOTENTE. Elle lit
 * `getComputedStyle(el).color` — c'est-à-dire la couleur TELLE QU'ELLE EST MAINTENANT, marque comprise. Or la
 * marque rend justement cette couleur claire. Au tour suivant, l'élément se lisait donc « clair », la marque
 * était retirée, et le noir revenait. Relevé en rejouant la passe quatre fois de suite sur la vraie page :
 *
 *     avant         noir   non marqué
 *     après passe 1 clair  MARQUÉ
 *     après passe 2 noir   non marqué
 *     après passe 3 clair  MARQUÉ
 *     après passe 4 noir   non marqué
 *
 * La lisibilité de la signature dépendait donc de la PARITÉ du nombre de passes — autant dire du hasard. Et
 * comme la passe se rejoue à chaque bascule de thème et à chaque changement de contenu, le hasard était fréquent.
 *
 * 🔴 ON EFFACE DONC TOUT AVANT DE MESURER : la passe juge alors les couleurs DU MAIL, jamais les siennes. Deux
 * passes de suite donnent exactement le même résultat, et c'est ce qu'un test exige maintenant.
 *
 * ⚠️ L'EFFACEMENT ET LE MARQUAGE SONT DANS LE MÊME TOUR SYNCHRONE : rien n'est peint entre les deux, donc aucun
 * clignotement. Et l'héritage continue de fonctionner comme avant — un ancêtre relevé éclaircit ses descendants
 * qui n'imposent pas leur propre couleur, et ceux-là restent sans marque, ce qui est juste.
 */
export function releverDans(conteneur: Element): void {
  /* 🔴 D'ABORD EFFACER : voir l'encadré. Sans cette ligne, la passe se contredit un tour sur deux. */
  nettoyerDans(conteneur);
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
 * Elle se rejoue à quatre moments, et il faut les quatre :
 *   ① au montage et à chaque changement du contenu (`versions`) — un mail qu'on déplie, une signature insérée ;
 *   ② 🔴🔴 à chaque fois que le CONTENU DU CONTENEUR CHANGE RÉELLEMENT, quelle qu'en soit la cause ;
 *   ③ à chaque bascule de thème — l'attribut `data-theme` change sur la racine, sans que le contenu bouge ;
 *   ④ quand le système bascule, si le thème est réglé sur « Système ».
 *
 * ═══ 🔴🔴 POURQUOI ② A DÛ ÊTRE AJOUTÉ — LOT EDITEUR-SIGNATURE-SOMBRE-ET-MINIATURES ══════════════════════════
 *
 * CONSTAT D'ARNO (03/10/2026) : « Nouveau message » en thème Sombre, la ligne « 2 rue Mars et Roty, 92800
 * Puteaux » de la signature reste NOIRE sur fond sombre, alors que « Service Gestion » et les téléphones sont
 * bien clairs.
 *
 * 🔴 LA RÈGLE N'ÉTAIT PAS EN CAUSE, ET C'EST MESURÉ, pas supposé. Relevé dans le navigateur sur l'élément
 * fautif : couleur calculée `rgb(0, 0, 0)`, luminance 0, vivacité 0, aucun fond clair sur sa branche — donc
 * « à relever » sans l'ombre d'un doute. Et pourtant il ne portait PAS la marque. En rejouant la passe à
 * l'identique, à la main, dans la page : il la reçoit, et sa couleur passe à `rgb(232, 235, 239)`.
 *
 * 🔴 LE DÉFAUT ÉTAIT DONC UN DÉFAUT DE MOMENT, PAS DE CRITÈRE. La passe tournait sur `[htmlInitial]` ; or
 * l'éditeur est un `contentEditable` dans lequel on écrit IMPÉRATIVEMENT — signature chargée après coup, contenu
 * inséré par un bouton, collage, nœuds remplacés par le navigateur. Ces écritures-là ne changent aucune
 * dépendance React : la passe ne repassait jamais, et les éléments arrivés depuis gardaient leur noir.
 *
 * ⚠️ UN `MutationObserver` PLUTÔT QU'UNE DÉPENDANCE DE PLUS, et c'est le fond de la correction : on ne peut pas
 * énumérer d'avance toutes les façons dont ce conteneur change. Observer le conteneur lui-même les couvre
 * toutes, présentes et à venir — y compris celles qu'on n'a pas encore inventées.
 *
 * ⚠️ ET IL NE PEUT PAS BOUCLER SUR LUI-MÊME : la passe ne touche QUE `data-svv-sombre`, qui n'est pas dans
 * `attributeFilter`. Ses propres écritures ne réveillent donc pas l'observateur. Le `requestAnimationFrame`
 * groupe en outre les rafales (une insertion produit des dizaines de mutations) en un seul passage.
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
    /**
     * ⚠️ UNE SEULE PASSE EN ATTENTE À LA FOIS. Une insertion de signature produit des dizaines de mutations ; sans
     * ce verrou, chacune programmerait sa propre passe sur le document entier.
     */
    let prevue = false;
    const differer = (): void => {
      if (prevue) return;
      prevue = true;
      const tour = (): void => { prevue = false; passer(); };
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(tour);
      else tour();
    };
    differer();

    /**
     * ② 🔴🔴 LE CONTENU DU CONTENEUR CHANGE — ET C'EST LE SEUL SIGNAL QUI LES ATTRAPE TOUS.
     *
     * Voir l'encadré au-dessus : la signature chargée après coup échappait à toute dépendance React, et sa ligne
     * d'adresse restait noire sur fond sombre. On observe donc le conteneur lui-même.
     *
     * ⚠️ `data-svv-sombre` N'EST PAS DANS `attributeFilter` : la passe ne peut pas se réveiller elle-même.
     */
    const surContenu = typeof MutationObserver === 'function' ? new MutationObserver(differer) : null;
    surContenu?.observe(zone, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'color', 'class'],
    });

    /* ③ LA BASCULE DE THÈME : `data-theme` change sur la racine, le contenu ne bouge pas. Sans cet observateur,
       il faudrait rouvrir le mail pour que la correction s'applique. */
    const racine = document.querySelector('.svv-adm-root');
    const obs = racine !== null && typeof MutationObserver === 'function'
      ? new MutationObserver(differer) : null;
    obs?.observe(racine as Node, { attributes: true, attributeFilter: ['data-theme'] });

    /* ④ LE RÉGLAGE « SYSTÈME » : c'est l'ordinateur qui bascule, et aucun attribut ne change chez nous. */
    const media = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    media?.addEventListener?.('change', differer);

    return () => {
      surContenu?.disconnect();
      obs?.disconnect();
      media?.removeEventListener?.('change', differer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `versions` EST la liste de dépendances voulue.
  }, [ref, ...versions]);
}
