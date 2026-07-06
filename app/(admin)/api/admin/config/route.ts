import 'server-only';
import { query } from '../../../../lib/db/client';
import { evaluerRepli } from './repli';

/**
 * GET /api/admin/config — LECTURE SEULE stricte (EX-1..EX-7).
 *
 * Expose les 46 colonnes du singleton `config_scoring` (id=1). SELECT seul :
 * aucune écriture, aucune autre méthode HTTP exportée. ISOLATION : n'importe que
 * le pool pg générique (`client.ts`, en lecture) et le helper local `./repli` ;
 * AUCUN import de `app/lib/svv/**` ni de logique métier DB (`profilConfig`, etc.).
 * Route gardée par `proxy.ts` sur `/api/admin/**` (sans session → 401, EX-4).
 * Runtime Node par défaut.
 */
export async function GET() {
  try {
    const { rows } = await query(
      `SELECT id,
              boost_f2, boost_f4, forfait_cone_central, forfait_extremites, cone_f3_demi_angle_deg,
              distance_max_m, plafond_couche1, plafond_degagement, mode_combinaison,
              couloir_seuil_lateral_m, couloir_fenetre_condition_n, couloir_tolerance_bord_n,
              couloir_malus_pct, natures_remarquables,
              cone_famille_demi_angle_deg, mondial_faisceau_m,
              mh_cone, mh_flanc, mh_distmax_m,
              inv_cone, inv_flanc, inv_distmax_m,
              a1900_cone, a1900_flanc, a1900_distmax_m,
              a1935_cone, a1935_flanc, a1935_distmax_m,
              cumul_seuil_min_m, cumul_base_m, cumul_pas_m, cumul_increment, cumul_plafond, cumul_cap_p1_m,
              orientation_n, orientation_ne, orientation_e, orientation_se,
              orientation_s, orientation_so, orientation_o, orientation_no,
              borne_annee_1900, borne_annee_1935, analysis_range_m
       FROM config_scoring WHERE id = 1`,
    );

    const ligne = rows[0];
    if (!ligne) {
      // EX-5 : ligne id=1 absente → état explicite, pas d'erreur serveur.
      return Response.json({ present: false });
    }

    // EX-7 : valeurs brutes (sans arrondi). EX-17 : indicateur profil actif vs repli.
    return Response.json({ present: true, valeurs: ligne, repli: evaluerRepli(ligne) });
  } catch {
    // EX-6 : accès base en échec → erreur maîtrisée, la page ne plante pas.
    return Response.json({ present: false, erreur: 'configuration indisponible' }, { status: 503 });
  }
}
