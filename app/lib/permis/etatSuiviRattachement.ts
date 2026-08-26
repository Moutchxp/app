/**
 * RATTACHEMENT — DÉCISION PURE de l'état d'un dossier de suivi (aucune I/O). Combine, dans l'ordre :
 *  1. la GÉOMÉTRIE (verdict FUS-2 → `etatInitialDepuisResultat`) — prioritaire ;
 *  2. la DAACT en REPLI (achèvement déclaré) quand la géométrie ne dit RIEN : ouvre un dossier `en_attente_bati` — JAMAIS `valide`,
 *     donc JAMAIS d'injection d'altitude (elle ouvre l'arbitrage, ne le conclut jamais) ;
 *  3. la PRÉSERVATION d'un état terminal humain/LiDAR (refuse / annule_par_lidar / valide humain) : jamais rétrogradé ni
 *     RESSUSCITÉ par une DAACT.
 * `persister:false` = aucun signal (ni géométrie, ni DAACT active/achevée). NE lit ni base, ni le moteur SVAV, ni preseanceAltitude.
 */
import type { EtatInitialDossier } from './preseanceAltitude';
import type { EtatSuivi } from './rattachementSuiviRepo';

export const MOTIF_DAACT =
  'Ouvert par l’attestation d’achèvement des travaux (DAACT) : travaux déclarés finis. En attente du bâti dans BD TOPO — l’affectation s’ouvrira quand le bâtiment sera mesuré.';

// ÉTAGE 1 — motif VRAI pour un achèvement déclaré sur un permis SANS signal géométrique possible (surélévation / surface constante).
//   Dit ce qu'il en est réellement : l'emprise au sol ne bouge pas → aucun bâti nouveau à attendre. Vocabulaire « bâtiment ».
export const MOTIF_ACHEVE_SANS_BATI =
  'Travaux déclarés achevés (DAACT). Rien à attendre géométriquement : une surélévation (ou une transformation à surface constante) ne modifie pas l’emprise au sol du bâtiment — son contour dans BD TOPO reste identique, aucun bâtiment nouveau n’apparaîtra. La hauteur ne viendrait que d’un futur passage LiDAR, dont la cadence n’est pas maîtrisée (entre les deux éditions BD TOPO disponibles, l’altitude et le nombre d’étages n’ont changé pour aucun des 697 338 bâtiments communs). À confirmer et clore.';

export interface EntreeEtatSuivi {
  initialGeom: EtatInitialDossier | null;   // etatInitialDepuisResultat(resultat) — null si verdict géométrique RIEN
  daactActif: boolean;                        // réglage : la DAACT déclenche-t-elle un dossier ?
  acheveDaact: boolean;                        // etat_dau === '6' (Terminé = DAACT)
  sansSignalGeometrique: boolean;             // ÉTAGE 1 — aucun signal géométrique POSSIBLE (surélévation / surface constante), cf. aucunSignalGeometriquePossible
  existant: { etat: EtatSuivi; valideParHumain: boolean } | null; // dossier déjà présent (pour la préservation)
}

export interface DecisionEtatSuivi {
  persister: boolean;
  etat: EtatSuivi;
  auto: boolean;         // true = validé par le moteur (par='moteur:auto') — JAMAIS le cas pour la DAACT
  preserve: boolean;     // un état terminal a été conservé
  origineDaact: boolean; // le dossier est ouvert par la DAACT (pour le motif + la traçabilité)
}

export function resoudreEtatSuivi(e: EntreeEtatSuivi): DecisionEtatSuivi {
  // 1+2 — cible = géométrie si elle a tranché, sinon repli DAACT. ÉTAGE 1 : sur un achèvement déclaré SANS signal géométrique
  //   possible (surélévation / surface constante), on n'ouvre PAS « en_attente_bati » (motif mensonger : aucun bâti n'arrivera) →
  //   on ouvre « acheve_sans_bati » (décision humaine : confirmer et clore). Sinon, comportement ACTUEL (en_attente_bati).
  const declencheDaact = e.initialGeom === null && e.daactActif && e.acheveDaact;
  const cibleDaact: EtatSuivi = e.sansSignalGeometrique ? 'acheve_sans_bati' : 'en_attente_bati';
  const cible: { etat: EtatSuivi; auto: boolean } | null =
    e.initialGeom ?? (declencheDaact ? { etat: cibleDaact, auto: false } : null);
  if (cible === null) {
    return { persister: false, etat: 'suivi_aucun_signal', auto: false, preserve: false, origineDaact: false };
  }
  // 3 — préservation d'un état terminal (humain / LiDAR / clôture manuelle) : ni rétrogradé, ni ressuscité par une DAACT.
  const preserve = !!e.existant && (
    e.existant.etat === 'refuse' || e.existant.etat === 'annule_par_lidar' || e.existant.etat === 'clos_sans_bati' ||
    (e.existant.etat === 'valide' && e.existant.valideParHumain)
  );
  const etat: EtatSuivi = preserve && e.existant ? e.existant.etat : cible.etat;
  const auto = !preserve && cible.auto;
  return { persister: true, etat, auto, preserve, origineDaact: declencheDaact && !preserve };
}
