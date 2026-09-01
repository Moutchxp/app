'use client';

import { CLE_STOCKAGE_THEME, THEME_DEFAUT, themeDepuisStockage, type ThemeChoisi } from '../../../lib/admin/theme';

/** Événement interne émis à chaque persistance : permet à useSyncExternalStore de resynchroniser l'UI (et les autres onglets via 'storage'). */
const EVT_CHANGE = 'svv-theme-change';

/**
 * LOT 37 — effets DOM/stockage du thème admin, ISOLÉS ici pour être testables (jsdom) hors du rendu React. `theme.ts` reste pur ;
 * ce module est la seule couche qui touche le document et localStorage.
 */

/** La racine admin porteuse de `data-theme` (posée par app/(admin)/layout.tsx). */
export function racineTheme(): Element | null {
  return typeof document !== 'undefined' ? document.querySelector('.svv-adm-root') : null;
}

/**
 * Pose `data-theme=pref` sur la racine en GELANT les transitions le temps de la bascule (aucun fondu de couleur — exigence du lot,
 * et prefers-reduced-motion). L'attribut est posé SYNCHRONEMENT ; la classe de gel est retirée une fois le nouveau style peint.
 */
export function appliquerThemeSur(root: Element | null, pref: ThemeChoisi): void {
  if (!root) return;
  root.classList.add('svv-no-transition');
  root.setAttribute('data-theme', pref);
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('svv-no-transition')));
  } else {
    root.classList.remove('svv-no-transition');
  }
}

/** Préférence persistée (localStorage) → thème sûr. Toute indisponibilité/valeur invalide retombe sur le défaut. */
export function lireThemePersiste(): ThemeChoisi {
  try {
    return themeDepuisStockage(localStorage.getItem(CLE_STOCKAGE_THEME));
  } catch {
    return themeDepuisStockage(null);
  }
}

/** Persiste la préférence (best-effort : un mode privé strict ne doit pas casser la bascule de la session), puis notifie l'UI. */
export function persisterTheme(pref: ThemeChoisi): void {
  try {
    localStorage.setItem(CLE_STOCKAGE_THEME, pref);
  } catch {
    /* stockage indisponible : la bascule reste effective pour la session en cours. */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVT_CHANGE));
}

/* --- Store externe (useSyncExternalStore) : lit la préférence sans setState-en-effet ni décalage d'hydratation. --- */

/** Abonnement aux changements de préférence (cet onglet via EVT_CHANGE, autres onglets via 'storage'). */
export function souscrireTheme(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVT_CHANGE, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(EVT_CHANGE, cb);
    window.removeEventListener('storage', cb);
  };
}

/** Instantané CLIENT : la préférence réellement persistée. */
export function snapshotTheme(): ThemeChoisi {
  return lireThemePersiste();
}

/** Instantané SERVEUR / hydratation : le défaut (aucun localStorage) → aucun décalage d'hydratation. */
export function snapshotThemeServeur(): ThemeChoisi {
  return THEME_DEFAUT;
}
