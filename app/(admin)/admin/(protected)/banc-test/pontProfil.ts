/**
 * Banc M5 · Lot 2b — Pont colonne `config_scoring` ↔ champ `ProfilDegagement`.
 *
 * L'éditeur du banc édite un `ProfilDegagement` (clone en mémoire) mais réutilise les MÉTADONNÉES de M1
 * (`pilotage/mappingConfig` : libellés, bornes, statuts, types), qui sont indexées par COLONNE de base.
 * Ce pont fait le lien 1:1 — reproduit EXACTEMENT le mapping de `profilConfig.chargerProfilDegagement`
 * (colonne → champ) — SANS toucher au moteur ni à la base. `ecrire` mute un CLONE (jamais la source).
 * Module PUR, client-safe (aucun accès DB/IA).
 */
import type { ProfilDegagement } from "../../../../lib/svv/profilDegagement";
import type { Orientation } from "../../../../lib/svv/config";

export interface PontChamp {
  /** Clé de colonne (identique à `mappingConfig` M1) → source des libellés/bornes/statuts. */
  colonne: string;
  /** Lit la valeur courante du champ correspondant dans un profil. */
  lire: (p: ProfilDegagement) => number | string | readonly string[];
  /** Écrit la valeur dans un profil (mute un CLONE ; jamais la source active). */
  ecrire: (p: ProfilDegagement, v: number | string) => void;
}

const SECTEURS: readonly Orientation[] = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];

const pontsOrientation: PontChamp[] = SECTEURS.map((s) => ({
  colonne: `orientation_${s.toLowerCase()}`,
  lire: (p) => p.orientationPts[s],
  ecrire: (p, v) => {
    p.orientationPts[s] = Number(v);
  },
}));

/** Les 38 champs pilotables du profil (id exclu), reliés 1:1 à leur colonne `config_scoring`. */
export const PONTS: readonly PontChamp[] = [
  // Héritage (VESTIGIALE — lecture seule ; ecrire présent mais l'UI ne l'appelle pas).
  { colonne: "boost_f2", lire: (p) => p.boostF2, ecrire: (p, v) => { p.boostF2 = Number(v); } },
  { colonne: "forfait_cone_central", lire: (p) => p.forfaitConeCentral, ecrire: (p, v) => { p.forfaitConeCentral = Number(v); } },
  { colonne: "forfait_extremites", lire: (p) => p.forfaitExtremites, ecrire: (p, v) => { p.forfaitExtremites = Number(v); } },
  { colonne: "cone_f3_demi_angle_deg", lire: (p) => p.coneF3DemiAngleDeg, ecrire: (p, v) => { p.coneF3DemiAngleDeg = Number(v); } },
  { colonne: "natures_remarquables", lire: (p) => p.naturesRemarquables, ecrire: () => { /* liste vestigiale — non éditée */ } },
  // Distance perçue : base & nature.
  { colonne: "boost_f4", lire: (p) => p.boostF4, ecrire: (p, v) => { p.boostF4 = Number(v); } },
  { colonne: "distance_max_m", lire: (p) => p.distanceMaxM, ecrire: (p, v) => { p.distanceMaxM = Number(v); } },
  // Barème par famille.
  { colonne: "cone_famille_demi_angle_deg", lire: (p) => p.coneFamilleDemiAngleDeg, ecrire: (p, v) => { p.coneFamilleDemiAngleDeg = Number(v); } },
  { colonne: "mondial_faisceau_m", lire: (p) => p.famillesPonderation.mondialFaisceauM, ecrire: (p, v) => { p.famillesPonderation.mondialFaisceauM = Number(v); } },
  { colonne: "mh_cone", lire: (p) => p.famillesPonderation.mh.cone, ecrire: (p, v) => { p.famillesPonderation.mh.cone = Number(v); } },
  { colonne: "mh_flanc", lire: (p) => p.famillesPonderation.mh.flanc, ecrire: (p, v) => { p.famillesPonderation.mh.flanc = Number(v); } },
  { colonne: "mh_distmax_m", lire: (p) => p.famillesPonderation.mh.distMaxM, ecrire: (p, v) => { p.famillesPonderation.mh.distMaxM = Number(v); } },
  { colonne: "inv_cone", lire: (p) => p.famillesPonderation.inventaire.cone, ecrire: (p, v) => { p.famillesPonderation.inventaire.cone = Number(v); } },
  { colonne: "inv_flanc", lire: (p) => p.famillesPonderation.inventaire.flanc, ecrire: (p, v) => { p.famillesPonderation.inventaire.flanc = Number(v); } },
  { colonne: "inv_distmax_m", lire: (p) => p.famillesPonderation.inventaire.distMaxM, ecrire: (p, v) => { p.famillesPonderation.inventaire.distMaxM = Number(v); } },
  // Cumul nature + bâti.
  { colonne: "cumul_seuil_min_m", lire: (p) => p.cumulNature.seuilMinM, ecrire: (p, v) => { p.cumulNature.seuilMinM = Number(v); } },
  { colonne: "cumul_base_m", lire: (p) => p.cumulNature.baseM, ecrire: (p, v) => { p.cumulNature.baseM = Number(v); } },
  { colonne: "cumul_pas_m", lire: (p) => p.cumulNature.pasM, ecrire: (p, v) => { p.cumulNature.pasM = Number(v); } },
  { colonne: "cumul_increment", lire: (p) => p.cumulNature.increment, ecrire: (p, v) => { p.cumulNature.increment = Number(v); } },
  { colonne: "cumul_plafond", lire: (p) => p.cumulNature.plafond, ecrire: (p, v) => { p.cumulNature.plafond = Number(v); } },
  { colonne: "cumul_cap_p1_m", lire: (p) => p.cumulNature.capP1M, ecrire: (p, v) => { p.cumulNature.capP1M = Number(v); } },
  // Malus couloir.
  { colonne: "couloir_seuil_lateral_m", lire: (p) => p.couloirSeuilLateralM, ecrire: (p, v) => { p.couloirSeuilLateralM = Number(v); } },
  { colonne: "couloir_fenetre_condition_n", lire: (p) => p.couloirFenetreConditionN, ecrire: (p, v) => { p.couloirFenetreConditionN = Number(v); } },
  { colonne: "couloir_tolerance_bord_n", lire: (p) => p.couloirToleranceBordN, ecrire: (p, v) => { p.couloirToleranceBordN = Number(v); } },
  { colonne: "couloir_malus_pct", lire: (p) => p.couloirMalusPct, ecrire: (p, v) => { p.couloirMalusPct = Number(v); } },
  // Normalisation, orientation & plafonds.
  { colonne: "plafond_degagement", lire: (p) => p.plafondDegagement, ecrire: (p, v) => { p.plafondDegagement = Number(v); } },
  { colonne: "plafond_couche1", lire: (p) => p.plafondCouche1, ecrire: (p, v) => { p.plafondCouche1 = Number(v); } },
  ...pontsOrientation,
  // Portée & garde-fou.
  { colonne: "analysis_range_m", lire: (p) => p.analysisRangeM, ecrire: (p, v) => { p.analysisRangeM = Number(v); } },
  // Mode de combinaison (enum — chaîne).
  { colonne: "mode_combinaison", lire: (p) => p.modeCombinaison, ecrire: (p, v) => { p.modeCombinaison = v as ProfilDegagement["modeCombinaison"]; } },
  { colonne: "mode_combinaison_repli", lire: (p) => p.modeCombinaisonRepli, ecrire: (p, v) => { p.modeCombinaisonRepli = v as ProfilDegagement["modeCombinaisonRepli"]; } },
];

/** Pont d'une colonne donnée, ou `undefined`. */
export function pontParColonne(colonne: string): PontChamp | undefined {
  return PONTS.find((p) => p.colonne === colonne);
}
