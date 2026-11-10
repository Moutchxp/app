'use client';

import { useEffect, useState } from 'react';
import { compterPreavisEnAlerte, type StatutPrevisite } from '../../../../lib/location/previsite';

/**
 * ══ 🔴🔴 LES PRÉAVIS, SYNCHRONISÉS ENTRE LA LOCATION ET LA GESTION (Arno, 10/11/2026) ════════════════════════════════════════════
 *
 * Arno : « Une page déjà ouverte se met à jour quand on y revient (retour sur l'onglet) et toutes les 30 secondes, ainsi qu'immédiatement
 * après chaque action. » Le bloc « Locataires en préavis » (Location, Gestion, pleine page) et la pastille du menu de la Gestion lisent la
 * MÊME donnée (`/api/admin/location?preavisEnCours=1`) ; après un geste, l'écran qui l'a fait le SIGNALE (`signalerPreavis`) et tous les
 * lecteurs de la page relisent aussitôt.
 */

export const EVENEMENT_PREAVIS = 'svav:preavis-change';
export const INTERVALLE_PREAVIS_MS = 30_000;

/** Après un geste (préavis, pré-visite, état des lieux, sortie) : tous les lecteurs de la page relisent. */
export function signalerPreavis(): void {
  try { window.dispatchEvent(new Event(EVENEMENT_PREAVIS)); } catch { /* sans fenêtre : rien */ }
}

/** Relit toutes les 30 s, au retour sur l'onglet, et à chaque geste signalé. */
export function useRafraichissementPreavis(relire: () => void, actif = true): void {
  useEffect(() => {
    if (!actif) return undefined;
    const visible = (): void => { if (document.visibilityState === 'visible') relire(); };
    const minuterie = window.setInterval(() => { if (document.visibilityState !== 'hidden') relire(); }, INTERVALLE_PREAVIS_MS);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('focus', visible);
    window.addEventListener(EVENEMENT_PREAVIS, relire);
    return () => {
      window.clearInterval(minuterie);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('focus', visible);
      window.removeEventListener(EVENEMENT_PREAVIS, relire);
    };
  }, [relire, actif]);
}

/** La pastille du menu de la Gestion : le nombre de préavis en alerte (0 sans droit Location, sans la 464, ou en erreur). */
export function usePreavisEnAlerte(actif: boolean): number {
  const [n, setN] = useState(0);
  const [tour, setTour] = useState(0);
  useEffect(() => {
    if (!actif) return undefined;
    let vivant = true;
    fetch('/api/admin/location?preavisEnCours=1', { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { etat?: string; data?: { lignes?: { previsite?: { statut: StatutPrevisite } | null }[] } }) => {
        if (vivant) setN(d.etat === 'ok' && Array.isArray(d.data?.lignes) ? compterPreavisEnAlerte(d.data.lignes) : 0);
      })
      .catch(() => { if (vivant) setN(0); });
    return () => { vivant = false; };
  }, [actif, tour]);
  const [relire] = useState(() => () => setTour((t) => t + 1));
  useRafraichissementPreavis(relire, actif);
  return actif ? n : 0;
}
