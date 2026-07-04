/**
 * Chargement du profil de pondération de la Couche 1 depuis la table `config_scoring`
 * (source externalisée — Étape 1). Le profil est lu UNE SEULE FOIS par analyse (dans
 * le pipeline) puis passé en paramètre aux fonctions de calcul, dont les signatures
 * sont INCHANGÉES (elles reçoivent déjà un `ProfilDegagement`).
 *
 * Fallback : si la table est indisponible/vide/incohérente, on retombe sur
 * `PROFIL_DEGAGEMENT_DEFAUT` — comportement identique à l'existant. Aucune logique
 * de calcul ici : uniquement la SOURCE des constantes.
 */
import { query } from "./client";
import { PROFIL_DEGAGEMENT_DEFAUT, type ProfilDegagement, type ModeCombinaison } from "../svv/profilDegagement";

interface LigneConfigScoring {
  boost_f2: number;
  boost_f4: number;
  forfait_cone_central: number;
  forfait_extremites: number;
  cone_f3_demi_angle_deg: number;
  distance_max_m: number;
  plafond_couche1: number;
  plafond_degagement: number;
  mode_combinaison: string;
  couloir_seuil_lateral_m: number;
  couloir_fenetre_condition_n: number;
  couloir_tolerance_bord_n: number;
  couloir_malus_pct: number;
  natures_remarquables: string[];
  // Étape 2 — barème familles + cumul nature.
  cone_famille_demi_angle_deg: number;
  mondial_faisceau_m: number;
  mh_cone: number; mh_flanc: number; mh_distmax_m: number;
  inv_cone: number; inv_flanc: number; inv_distmax_m: number;
  a1900_cone: number; a1900_flanc: number; a1900_distmax_m: number;
  a1935_cone: number; a1935_flanc: number; a1935_distmax_m: number;
  cumul_seuil_min_m: number;
  cumul_base_m: number;
  cumul_pas_m: number;
  cumul_increment: number;
  cumul_plafond: number;
  cumul_cap_p1_m: number;
}

const MODES_VALIDES: readonly ModeCombinaison[] = ["max", "addition", "sequentiel"];

/**
 * Lit le singleton `config_scoring` et le mappe en `ProfilDegagement`.
 * Retourne `PROFIL_DEGAGEMENT_DEFAUT` si la table est absente, vide ou si le
 * `mode_combinaison` stocké n'est pas reconnu (repli sûr, jamais d'exception propagée).
 */
export async function chargerProfilDegagement(): Promise<ProfilDegagement> {
  try {
    const res = await query<LigneConfigScoring>(
      `SELECT boost_f2, boost_f4, forfait_cone_central, forfait_extremites,
              cone_f3_demi_angle_deg, distance_max_m, plafond_couche1, plafond_degagement,
              mode_combinaison, couloir_seuil_lateral_m, couloir_fenetre_condition_n,
              couloir_tolerance_bord_n, couloir_malus_pct, natures_remarquables,
              cone_famille_demi_angle_deg, mondial_faisceau_m,
              mh_cone, mh_flanc, mh_distmax_m, inv_cone, inv_flanc, inv_distmax_m,
              a1900_cone, a1900_flanc, a1900_distmax_m, a1935_cone, a1935_flanc, a1935_distmax_m,
              cumul_seuil_min_m, cumul_base_m, cumul_pas_m, cumul_increment, cumul_plafond, cumul_cap_p1_m
       FROM config_scoring WHERE id = 1`,
    );
    const r = res.rows[0];
    if (!r) return PROFIL_DEGAGEMENT_DEFAUT;
    if (!MODES_VALIDES.includes(r.mode_combinaison as ModeCombinaison)) return PROFIL_DEGAGEMENT_DEFAUT;
    return {
      boostF2: r.boost_f2,
      boostF4: r.boost_f4,
      forfaitConeCentral: r.forfait_cone_central,
      forfaitExtremites: r.forfait_extremites,
      coneF3DemiAngleDeg: r.cone_f3_demi_angle_deg,
      distanceMaxM: r.distance_max_m,
      plafondCouche1: r.plafond_couche1,
      plafondDegagement: r.plafond_degagement,
      modeCombinaison: r.mode_combinaison as ModeCombinaison,
      couloirSeuilLateralM: r.couloir_seuil_lateral_m,
      couloirFenetreConditionN: r.couloir_fenetre_condition_n,
      couloirToleranceBordN: r.couloir_tolerance_bord_n,
      couloirMalusPct: r.couloir_malus_pct,
      naturesRemarquables: r.natures_remarquables,
      coneFamilleDemiAngleDeg: r.cone_famille_demi_angle_deg,
      famillesPonderation: {
        mondialFaisceauM: r.mondial_faisceau_m,
        mh: { cone: r.mh_cone, flanc: r.mh_flanc, distMaxM: r.mh_distmax_m },
        inventaire: { cone: r.inv_cone, flanc: r.inv_flanc, distMaxM: r.inv_distmax_m },
        ancien1900: { cone: r.a1900_cone, flanc: r.a1900_flanc, distMaxM: r.a1900_distmax_m },
        ancien1935: { cone: r.a1935_cone, flanc: r.a1935_flanc, distMaxM: r.a1935_distmax_m },
      },
      cumulNature: {
        seuilMinM: r.cumul_seuil_min_m,
        baseM: r.cumul_base_m,
        pasM: r.cumul_pas_m,
        increment: r.cumul_increment,
        plafond: r.cumul_plafond,
        capP1M: r.cumul_cap_p1_m,
      },
    };
  } catch {
    // Table indisponible (env sans DB, migration non jouée…) → repli sur le défaut.
    return PROFIL_DEGAGEMENT_DEFAUT;
  }
}
