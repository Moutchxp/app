/**
 * FUS-3a — PRÉSÉANCE de l'altitude d'un polygone, logique PURE et testée. AUCUNE I/O. C'est le CŒUR du chantier.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗
 * ║ 🔴 INVARIANT INVERSÉ — LIRE DEUX FOIS AVANT DE « CORRIGER ».                                                              ║
 * ║ Partout ailleurs dans l'app : « une SAISIE n'est JAMAIS écrasée » (origine='saisie' protégée de l'extraction).            ║
 * ║ ICI C'EST L'INVERSE : une altitude d'origine 'permis' DOIT être écrasée par une nouvelle mesure LiDAR.                    ║
 * ║   · Le LiDAR MESURE la réalité du toit construit ; le permis DÉCLARE une intention, provisoire tant qu'elle n'est pas     ║
 * ║     mesurée. Donc une mesure LiDAR l'emporte TOUJOURS, y compris sur un 'permis' VALIDÉ → dossier `annule_par_lidar`.     ║
 * ║   · `altitudeLidarRefige` = l'altitude LiDAR figée JUSTE AVANT l'écrasement par le permis (relue à l'instant de           ║
 * ║     l'injection, PAS celle du snapshot d'analyse : BD TOPO a pu être remesurée entre-temps, et le retour arrière          ║
 * ║     restaurerait sinon une valeur périmée).                                                                              ║
 * ║ NE PAS « réparer » en protégeant 'permis' : ce serait garder une valeur déclarée périmée par la mesure réelle. Un test    ║
 * ║ (preseanceAltitude.test.ts, « GARDE anti-inversion ») CASSE si quelqu'un inverse cette préséance.                        ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝
 */
import type { ResultatRattachement } from './detectionRattachement';

export type OrigineAltitude = 'lidar' | 'permis';

export interface EtatAltitudePolygone {
  altitudeNgf: number | null;          // altitude EFFECTIVE courante (NGF absolu)
  origine: OrigineAltitude | null;     // origine de l'altitude courante (null = aucune altitude posée)
  altitudeLidarRefige: number | null;  // LiDAR figée avant un écrasement 'permis' (pour le retour arrière) ; null si rien à restaurer
}

export type EvenementAltitude =
  // Nouvelle mesure LiDAR arrivée (nouvelle livraison BD TOPO/MNS) — écrase TOUJOURS.
  | { type: 'mesure_lidar'; altitudeLidar: number }
  // Validation d'un permis : injecte l'altitude déclarée, en refigeant la LiDAR ACTUELLE (relue à l'instant, pas le snapshot).
  | { type: 'injection_permis'; altitudePermis: number; altitudeLidarActuelle: number | null }
  // Retour arrière manuel : restaure la LiDAR refigée.
  | { type: 'retour_arriere' };

export type EffetPreseance = 'ecrase_par_lidar' | 'lidar_maj' | 'injecte_permis' | 'retour_lidar' | 'sans_effet';

export interface ResultatPreseance {
  etat: EtatAltitudePolygone;   // nouvel état
  ecrasePermis: boolean;        // true ⇒ une altitude 'permis' vient d'être écrasée par LiDAR → le dossier passe à `annule_par_lidar`
  effet: EffetPreseance;
  trace: string;                // récit lisible (auditabilité : « on doit pouvoir raconter l'histoire »)
}

/** Applique un événement d'altitude à l'état d'un polygone selon la préséance LiDAR. PUR : mêmes entrées → même sortie. */
export function appliquerPreseanceAltitude(etat: EtatAltitudePolygone, ev: EvenementAltitude): ResultatPreseance {
  switch (ev.type) {
    case 'mesure_lidar': {
      // 🔴 PRÉSÉANCE : une mesure LiDAR ÉCRASE TOUJOURS l'altitude — y compris une altitude d'origine 'permis' VALIDÉE.
      // NE PAS protéger 'permis' ici (ce n'est PAS l'invariant « saisie protégée ») : le LiDAR mesure, le permis déclare.
      // Cas où il n'y a rien à écraser (permis jamais validé → origine 'lidar' ou null) : simple mise à jour LiDAR.
      const ecrasePermis = etat.origine === 'permis';
      return {
        etat: { altitudeNgf: ev.altitudeLidar, origine: 'lidar', altitudeLidarRefige: null },
        ecrasePermis,
        effet: ecrasePermis ? 'ecrase_par_lidar' : 'lidar_maj',
        trace: ecrasePermis
          ? `mesure LiDAR ${ev.altitudeLidar} écrase l'altitude permis ${etat.altitudeNgf ?? '—'} → origine lidar ; dossier annulé par LiDAR`
          : `mesure LiDAR ${ev.altitudeLidar} appliquée (origine précédente : ${etat.origine ?? 'aucune'})`,
      };
    }
    case 'injection_permis': {
      // Refige la LiDAR ACTUELLE (à jour, pas le snapshot) AVANT d'injecter la déclarée → le retour arrière restaurera une
      // valeur à jour. L'altitude passe en origine 'permis' (provisoire tant que le LiDAR n'a pas mesuré le toit construit).
      return {
        etat: { altitudeNgf: ev.altitudePermis, origine: 'permis', altitudeLidarRefige: ev.altitudeLidarActuelle },
        ecrasePermis: false,
        effet: 'injecte_permis',
        trace: `permis injecte ${ev.altitudePermis} (origine permis) ; LiDAR ${ev.altitudeLidarActuelle ?? 'aucune'} refigée pour le retour arrière`,
      };
    }
    case 'retour_arriere': {
      // Restaure la LiDAR refigée. Si aucune n'a été refigée (aucun permis validé n'a écrasé) : rien à restaurer.
      if (etat.altitudeLidarRefige === null) {
        return { etat, ecrasePermis: false, effet: 'sans_effet', trace: 'retour arrière sans altitude LiDAR refigée → aucun changement' };
      }
      return {
        etat: { altitudeNgf: etat.altitudeLidarRefige, origine: 'lidar', altitudeLidarRefige: null },
        ecrasePermis: false,
        effet: 'retour_lidar',
        trace: `retour arrière : restaure l'altitude LiDAR refigée ${etat.altitudeLidarRefige} → origine lidar`,
      };
    }
  }
}

// ── Bridge FUS-2 → état initial du dossier ───────────────────────────────────
export type EtatDossierRattachement = 'en_attente_bati' | 'arbitrage_demande' | 'valide' | 'refuse' | 'annule_par_lidar';

export interface EtatInitialDossier { etat: EtatDossierRattachement; auto: boolean } // auto=true ⇒ validé par le moteur (par='moteur:auto')

/**
 * État initial d'un dossier à partir du verdict FUS-2 (PUR). `null` si RIEN (aucune détection → pas de dossier).
 *  · ARBITRAGE_DEMANDE            → arbitrage_demande (décision humaine attendue en FUS-3b).
 *  · RATTACHEMENT_AUTOMATIQUE + ≥1 polygone livré → valide AUTOMATIQUEMENT (c'est le sens de « automatique »). Ce dossier
 *    validé pourra plus tard passer à `annule_par_lidar` si une mesure LiDAR écrase l'altitude injectée (cas central d'Arno).
 *  · RATTACHEMENT_AUTOMATIQUE + 0 polygone (fusion parcellaire nette, bâti pas encore livré) → en_attente_bati.
 */
export function etatInitialDepuisResultat(r: ResultatRattachement): EtatInitialDossier | null {
  if (r.verdict === 'RIEN') return null;
  if (r.verdict === 'ARBITRAGE_DEMANDE') return { etat: 'arbitrage_demande', auto: false };
  return r.criteres.bati.nbNouveauxOuModifies >= 1
    ? { etat: 'valide', auto: true }        // polygone livré → rattachement automatique validé par le moteur
    : { etat: 'en_attente_bati', auto: false };
}
