'use client';

import { useEffect } from 'react';

/**
 * ══ 🔴🔴 LE BLOCAGE DU DÉFILEMENT DE LA PAGE, COMPTÉ — UN SEUL MÉCANISME POUR TOUTES LES FENÊTRES (Arno, 11/11/2026) ════════════════════════════
 *
 * Défaut constaté par Arno : la page ne défilait plus (molette et barre sans effet). Les fenêtres qui bloquaient le défilement le faisaient
 * chacune pour soi : « garder la valeur d'avant, mettre `hidden`, remettre la valeur d'avant en se fermant ». Deux fenêtres ouvertes l'une sur
 * l'autre (« Caractéristiques du bien » au-dessus de la « Fiche locataire » ou du « Dossier de location »…) se fermant dans un autre ordre
 * que l'inverse de leur ouverture, et la seconde remettait… `hidden` : la page restait figée, y compris sur la page suivante (le `body` est
 * le même d'une page à l'autre de l'application).
 *
 * DÉSORMAIS : le blocage est COMPTÉ — une fenêtre ouverte = +1, fermée = −1, quelle que soit la façon de la fermer (Échap, clic à l'extérieur,
 * « Revenir », « Annuler », démontage par un changement de page, une erreur…), et une fenêtre ne peut se compter qu'une fois. La DERNIÈRE qui
 * se ferme REND toujours le défilement (jamais « la valeur d'avant ») ; et au changement de page, un blocage sans fenêtre ouverte est levé.
 */

let compteur = 0;

function appliquer(): void {
  if (typeof document === 'undefined') return;
  if (compteur > 0) document.body.style.overflow = 'hidden';
  else document.body.style.removeProperty('overflow');
}

/** Bloque le défilement de la page ; rend la fonction qui le libère (idempotente : un seul −1, même appelée deux fois). */
export function verrouillerDefilement(): () => void {
  compteur += 1;
  appliquer();
  let libere = false;
  return () => {
    if (libere) return;
    libere = true;
    compteur = Math.max(0, compteur - 1);
    appliquer();
  };
}

/** Le nombre de fenêtres qui bloquent le défilement (épreuves, contrôles). */
export const blocagesOuverts = (): number => compteur;

/** Lève TOUT blocage (changement de page sans fenêtre ouverte). */
export function libererDefilement(): void {
  compteur = 0;
  appliquer();
}

/** La fenêtre bloque le défilement de la page tant qu'elle est montée (et `actif`). */
export function useVerrouDefilement(actif = true): void {
  useEffect(() => (actif ? verrouillerDefilement() : undefined), [actif]);
}

/**
 * AU CHANGEMENT DE PAGE : si un blocage reste compté alors qu'aucune fenêtre n'est ouverte dans la page (`[aria-modal="true"]`), il est
 * levé — aucun blocage ne survit à un changement de page. Appelé par le suivi commun de la navigation.
 */
export function verifierApresChangementDePage(): void {
  if (typeof document === 'undefined') return;
  if (compteur > 0 && document.querySelector('[aria-modal="true"]') === null) libererDefilement();
  else appliquer();
}
