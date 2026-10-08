'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
/**
 * 🔴 DEPUIS LE MODULE **PUR**, JAMAIS DEPUIS LE DÉPÔT. Ce crochet vit dans le navigateur : importer un dépôt le
 * ferait remonter jusqu'à `pg`, donc jusqu'à `dns`, et webpack refuserait de construire TOUTE l'application
 * (incident du 24/09/2026). Le garde `clientBoundary.guard.test.ts` le vérifie.
 */
import {
  glisserDemarre, rangeeApresGlisser, type CarteGlissable,
} from '../../../../lib/gestion/glisserCarte';

/**
 * ══ 🔴🔴 LOT FRISE-ORDRE-POSE-ET-GLISSER, POINT 8 — DÉPLACER UNE CARTE AU CLIC MAINTENU ═════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * ARNO (08/10/2026) : « Une carte posée peut être saisie par CLIC MAINTENU et glissée à une autre place dans la
 * frise ; au relâchement, sa nouvelle place est enregistrée. Le DÉFILEMENT de la frise (flèche ‹ ›) doit rester
 * utilisable pendant le glisser. Un clic simple, le crayon et le menu “…” continuent de fonctionner comme avant
 * (le glisser ne démarre qu'après un VRAI MAINTIEN + MOUVEMENT). »
 *
 * ═══ 🔴 CE QUI EST ICI, ET CE QUI N'Y EST PAS ═══════════════════════════════════════════════════════════════════
 *
 * ICI : le branchement des événements de pointeur, et lui seul. Le SEUIL, la place visée, les places permises et
 * la rangée d'après sont de l'arithmétique, et vivent dans le module PUR `glisserCarte` — où elles s'éprouvent
 * sans navigateur.
 *
 * ═══ 🔴🔴 CE QUI PROTÈGE LES TROIS GESTES QUI EXISTAIENT DÉJÀ ═══════════════════════════════════════════════════
 *
 * Le clic sur la carte, le crayon et le menu « … » doivent continuer de répondre. Trois choses s'y emploient :
 *   ① LE SEUIL (220 ms + 6 px) : tant qu'il n'est pas franchi, ce crochet n'a RIEN fait — ni `preventDefault`,
 *     ni capture de pointeur, ni état modifié. Un clic ordinaire ne le voit même pas passer.
 *   ② LA CAPTURE N'EST PRISE QU'AU FRANCHISSEMENT, pas à la descente : avant elle, les clics suivent leur route
 *     normale jusqu'aux boutons.
 *   ③ LE CLIC QUI SUIT UN GLISSER EST ANNULÉ, une fois, en capture. Sans cela, relâcher la carte sur place
 *     ouvrirait sa bulle — le même défaut que `useDefilementFrise` corrige déjà pour le glisser de la piste.
 *
 * ═══ 🔴 ET LE DÉFILEMENT RESTE UTILISABLE (exigence d'Arno) ═════════════════════════════════════════════════════
 *
 * Les flèches ‹ › sont des boutons hors de la piste : ce crochet n'écoute ni la piste ni les flèches, et ne pose
 * aucun `preventDefault` sur elles. Mieux : quand la carte saisie approche d'un bord, la piste défile d'elle-même
 * (`bordDeLaPiste`), pour qu'on puisse déposer une carte hors de l'écran sans lâcher.
 *
 * ⚠️ LES ÉCOUTEURS DE DÉPLACEMENT VIVENT SUR LA FENÊTRE, et seulement pendant un geste : un doigt qui sort de la
 * carte ne doit pas abandonner le glisser, et un écouteur global permanent coûterait à chaque mouvement de
 * souris de l'écran.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** À quelle distance d'un bord la piste se met à défiler toute seule, et de combien par image. */
const BORD_PX = 48;
const PAS_PX = 12;

export interface GlisserCarte {
  /** L'identifiant de la carte saisie, ou `null`. L'écran s'en sert pour la mettre en relief. */
  saisie: number | null;
  /** À brancher sur le `pointerdown` d'une carte déplaçable. */
  commencer: (id: number, ev: ReactPointerEvent) => void;
}

export function useGlisserCarte(
  piste: { current: HTMLElement | null },
  /** Le nouvel ordre, quand il change. `null` n'est jamais envoyé : le crochet ne l'appelle pas. */
  onDeposer: (ordre: number[]) => void,
): GlisserCarte {
  const [saisie, setSaisie] = useState<number | null>(null);
  /**
   * ⚠️ TOUT L'ÉTAT DU GESTE EST DANS UNE RÉFÉRENCE, ET NON DANS `useState` : il change à chaque image, et un
   * rendu par mouvement de souris ferait ramer la frise. Seul `saisie` est un état, parce que lui seul se voit.
   */
  const geste = useRef<{
    id: number; debut: number; x0: number; y0: number; actif: boolean; pointeur: number;
  } | null>(null);

  /** La rangée telle qu'elle est À L'ÉCRAN : les cartes dans l'ordre, avec leur centre mesuré. */
  const rangee = useCallback((): CarteGlissable[] => {
    const p = piste.current;
    if (p === null) return [];
    const bande = p.getBoundingClientRect();
    return [...p.querySelectorAll<HTMLElement>('li.fav-el--carre')].map((li) => {
      const r = li.getBoundingClientRect();
      const brut = li.dataset.carte;
      return {
        /* ⚠️ L'OUVERTURE DÉRIVÉE N'A PAS DE `data-carte` : elle prend 0, un identifiant qui n'existe pas en
           base. Elle occupe donc une place dans la rangée — ce qu'elle fait à l'écran — sans jamais pouvoir
           être saisie ni figurer dans l'ordre envoyé. */
        id: brut === undefined ? 0 : Number(brut),
        deplacable: li.dataset.fixe !== 'oui' && brut !== undefined,
        centre: r.left + r.width / 2 - bande.left + p.scrollLeft,
      };
    });
  }, [piste]);

  const commencer = useCallback((id: number, ev: ReactPointerEvent): void => {
    /* ⚠️ LE BOUTON PRINCIPAL SEULEMENT : un clic droit ouvre un menu contextuel, il n'enlève pas une carte. */
    if (ev.button !== 0) return;
    geste.current = {
      id, debut: Date.now(), x0: ev.clientX, y0: ev.clientY, actif: false, pointeur: ev.pointerId,
    };
  }, []);

  useEffect(() => {
    const surMouvement = (ev: PointerEvent): void => {
      const g = geste.current;
      if (g === null || ev.pointerId !== g.pointeur) return;
      if (!g.actif) {
        if (!glisserDemarre(Date.now() - g.debut, ev.clientX - g.x0, ev.clientY - g.y0)) return;
        g.actif = true;
        setSaisie(g.id);
      }
      /* 🔴 LE GESTE EST ENGAGÉ : on empêche la sélection de texte et le défilement tactile de la page. */
      ev.preventDefault();

      /* 🔴 LA PISTE DÉFILE TOUTE SEULE AUX BORDS — sans cela, on ne peut pas déposer une carte hors de l'écran
         sans lâcher, et la frise d'un dossier chargé en sort toujours. Les flèches restent utilisables. */
      const p = piste.current;
      if (p !== null) {
        const r = p.getBoundingClientRect();
        if (ev.clientX < r.left + BORD_PX) p.scrollLeft -= PAS_PX;
        else if (ev.clientX > r.right - BORD_PX) p.scrollLeft += PAS_PX;
      }
    };

    const surRelache = (ev: PointerEvent): void => {
      const g = geste.current;
      geste.current = null;
      if (g === null || ev.pointerId !== g.pointeur) return;
      if (!g.actif) return; /* ⚠️ SIMPLE CLIC : on n'a rien fait, et on ne fait rien. */
      setSaisie(null);

      const p = piste.current;
      const x = p === null ? 0 : ev.clientX - p.getBoundingClientRect().left + p.scrollLeft;
      const ordre = rangeeApresGlisser(rangee(), g.id, x);

      /**
       * 🔴 LE CLIC QUI SUIT EST ANNULÉ, UNE FOIS, EN CAPTURE. Relâcher la carte déclenche un `click` sur ce
       * qu'il y a dessous : sans cela, chaque dépôt ouvrirait la bulle de la carte. Même procédé que
       * `useDefilementFrise` pour le glisser de la piste.
       */
      const avaler = (c: Event): void => { c.stopPropagation(); c.preventDefault(); };
      window.addEventListener('click', avaler, { capture: true, once: true });
      /* ⚠️ ET ON LE RETIRE SI AUCUN CLIC NE VIENT (un relâchement hors de toute cible n'en produit pas) :
         sinon le PROCHAIN clic de l'écran, celui d'après, serait avalé à la place. */
      window.setTimeout(() => window.removeEventListener('click', avaler, { capture: true }), 0);

      if (ordre !== null) onDeposer(ordre);
    };

    /* ⚠️ `passive: false` SUR LE MOUVEMENT : c'est la seule façon d'appeler `preventDefault` (même règle que la
       molette dans `useDefilementFrise`). */
    window.addEventListener('pointermove', surMouvement, { passive: false });
    window.addEventListener('pointerup', surRelache);
    window.addEventListener('pointercancel', surRelache);
    return () => {
      window.removeEventListener('pointermove', surMouvement);
      window.removeEventListener('pointerup', surRelache);
      window.removeEventListener('pointercancel', surRelache);
    };
  }, [piste, rangee, onDeposer]);

  return { saisie, commencer };
}
