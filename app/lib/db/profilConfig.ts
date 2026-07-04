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
              couloir_tolerance_bord_n, couloir_malus_pct, natures_remarquables
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
    };
  } catch {
    // Table indisponible (env sans DB, migration non jouée…) → repli sur le défaut.
    return PROFIL_DEGAGEMENT_DEFAUT;
  }
}
