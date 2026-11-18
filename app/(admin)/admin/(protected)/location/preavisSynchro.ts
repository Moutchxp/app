'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { compterPreavisEnAlerte, type StatutPrevisite } from '../../../../lib/location/previsite';
import type { PlageRdv } from '../../../../lib/location/minutesRdv';

/**
 * ══ 🔴🔴 LES PRÉAVIS, SYNCHRONISÉS ENTRE LA LOCATION ET LA GESTION (Arno, 10/11/2026) ════════════════════════════════════════════
 *
 * Arno : « Une page déjà ouverte se met à jour quand on y revient (retour sur l'onglet) et toutes les 30 secondes, ainsi qu'immédiatement
 * après chaque action. » Le bloc « Locataires en préavis » (Location, Gestion, pleine page) et la pastille du menu de la Gestion lisent la
 * MÊME donnée (`/api/admin/location?preavisEnCours=1`) ; après un geste, l'écran qui l'a fait le SIGNALE (`signalerPreavis`) et tous les
 * lecteurs de la page relisent aussitôt.
 */

export const EVENEMENT_PREAVIS = 'svav:preavis-change';

/** 🔴 Arno (10/11/2026, option A) — la LECTURE côté Gestion (tout compte Gestion) : la même donnée, par une route de lecture seule. */
export const API_PREAVIS_GESTION = '/api/admin/gestion/preavis';
export const API_PREAVIS_LOCATION = '/api/admin/location';
/** La mention des boutons qui écrivent, pour un compte sans le droit « Location » (accord d'Arno pour les conditionner à ce droit). */
export const MENTION_RESERVE_LOCATION = 'Réservé aux comptes Location';

/** Ce que tout le bloc sait : d'où il lit, et si le compte peut écrire (droit « Location »). */
/** 🔴 Arno (18/11/2026) — + les minutes autorisées des rendez-vous (réglage `gestion_config.minutes_rdv`, rendu par le serveur ; défaut 00/15/30/45). */
export interface ValeurContextePreavis { base: string; ecriture: boolean; minutesRdv?: readonly number[];
  /** 🔴 Arno (19/11/2026) — la plage horaire des rendez-vous (réglage 499 ; défaut 8h00 / 20h00 / 21h00). */
  plageRdv?: PlageRdv }
export const ContextePreavis = createContext<ValeurContextePreavis>({ base: API_PREAVIS_LOCATION, ecriture: true });
export const useContextePreavis = (): ValeurContextePreavis => useContext(ContextePreavis);
export const INTERVALLE_PREAVIS_MS = 30_000;

/** Après un geste (préavis, pré-visite, état des lieux, sortie) : tous les lecteurs de la page relisent. */
export function signalerPreavis(): void {
  try { window.dispatchEvent(new Event(EVENEMENT_PREAVIS)); } catch { /* sans fenêtre : rien */ }
}

/** 🔴 Arno (18/11/2026, 2e lot) — la VEILLE des rendez-vous : « en quelques secondes au plus, sans recharger la page ». */
export const INTERVALLE_VEILLE_RDV_MS = 4_000;

/**
 * Toutes les 4 s (onglet VISIBLE seulement), l'empreinte des rendez-vous (`?rdvVersion=1`, trois compteurs) : quand un locataire ou un collègue
 * répond — ou qu'un rendez-vous bouge, dans n'importe quelle session — elle change, et les lignes sont relues (relecture DOUCE : la ligne
 * dépliée et la fenêtre ouverte restent en place). Sans réseau ou sans la route : rien, la relecture des 30 s continue.
 */
export function useVeilleRdv(base: string, relire: () => void, actif = true, intervalle = INTERVALLE_VEILLE_RDV_MS): void {
  useEffect(() => {
    if (!actif) return undefined;
    let vivant = true;
    let derniere: string | null = null;
    let enCours = false;
    const lire = async (): Promise<void> => {
      if (enCours || document.visibilityState === 'hidden') return;
      enCours = true;
      try {
        const r = await fetch(`${base}?rdvVersion=1`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
        const d = (await r.json().catch(() => null)) as { etat?: string; data?: { version?: unknown } } | null;
        const v = d?.etat === 'ok' && typeof d.data?.version === 'string' ? d.data.version : null;
        if (vivant && v !== null) {
          if (derniere !== null && v !== derniere) relire();
          derniere = v;
        }
      } catch { /* réseau : la prochaine fois */ } finally { enCours = false; }
    };
    void lire();
    const minuterie = window.setInterval(() => { void lire(); }, intervalle);
    return () => { vivant = false; window.clearInterval(minuterie); };
  }, [base, relire, actif, intervalle]);
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
export function usePreavisEnAlerte(actif: boolean, base: string = API_PREAVIS_LOCATION): number {
  const [n, setN] = useState(0);
  const [tour, setTour] = useState(0);
  useEffect(() => {
    if (!actif) return undefined;
    let vivant = true;
    fetch(`${base}?preavisEnCours=1`, { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { etat?: string; data?: { lignes?: { previsite?: { statut: StatutPrevisite; tousRefusent?: boolean } | null }[] } }) => {
        if (vivant) setN(d.etat === 'ok' && Array.isArray(d.data?.lignes) ? compterPreavisEnAlerte(d.data.lignes) : 0);
      })
      .catch(() => { if (vivant) setN(0); });
    return () => { vivant = false; };
  }, [actif, tour, base]);
  const [relire] = useState(() => () => setTour((t) => t + 1));
  useRafraichissementPreavis(relire, actif);
  return actif ? n : 0;
}
