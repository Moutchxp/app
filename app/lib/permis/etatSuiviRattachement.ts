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

export interface EntreeEtatSuivi {
  initialGeom: EtatInitialDossier | null;   // etatInitialDepuisResultat(resultat) — null si verdict géométrique RIEN
  daactActif: boolean;                        // réglage : la DAACT déclenche-t-elle un dossier ?
  acheveDaact: boolean;                        // etat_dau === '6' (Terminé = DAACT)
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
  // 1+2 — cible = géométrie si elle a tranché, sinon repli DAACT (en_attente_bati, jamais valide).
  const declencheDaact = e.initialGeom === null && e.daactActif && e.acheveDaact;
  const cible: EtatInitialDossier | null = e.initialGeom ?? (declencheDaact ? { etat: 'en_attente_bati', auto: false } : null);
  if (cible === null) {
    return { persister: false, etat: 'suivi_aucun_signal', auto: false, preserve: false, origineDaact: false };
  }
  // 3 — préservation d'un état terminal (humain / LiDAR) : ni rétrogradé, ni ressuscité par une DAACT.
  const preserve = !!e.existant && (
    e.existant.etat === 'refuse' || e.existant.etat === 'annule_par_lidar' ||
    (e.existant.etat === 'valide' && e.existant.valideParHumain)
  );
  const etat: EtatSuivi = preserve && e.existant ? e.existant.etat : cible.etat;
  const auto = !preserve && cible.auto;
  return { persister: true, etat, auto, preserve, origineDaact: declencheDaact && !preserve };
}
