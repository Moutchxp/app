import 'server-only';
import { query } from '../../../../lib/db/client';
import { evaluerRepli } from './repli';
import { validerPatch } from './validation';
import { metaParColonne } from '../../../admin/(protected)/pilotage/mappingConfig';

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

/**
 * PATCH /api/admin/config — ÉCRITURE dédiée (M1, T1/T2/T6).
 *
 * `UPDATE config_scoring WHERE id = 1` sur les seules colonnes soumises, après
 * validation server-side (`validerPatch` : type + plage + statut + anti-repli).
 * Écriture ATOMIQUE en un seul `query()` (CTE data-modifying) : UPDATE + journal
 * append-only `config_edit_log`. Les NOMS de colonnes du SET proviennent
 * EXCLUSIVEMENT de l'allowlist `META` (`metaParColonne`), jamais des clés brutes
 * du body. AUCUN `DELETE/DROP/ALTER/TRUNCATE`. AUCUN import `app/lib/svv`/`profilConfig`.
 */
export async function PATCH(request: Request) {
  // 1. Corps JSON — parse défensif (JSON invalide → 422, rien écrit).
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ erreurs: [{ colonne: '', message: 'corps JSON invalide' }] }, { status: 422 });
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return Response.json({ erreurs: [{ colonne: '', message: 'corps JSON invalide' }] }, { status: 422 });
  }
  const patch = body as Record<string, unknown>;

  // 2. Ligne actuelle (id=1) — nécessaire à la validation croisée + au journal (avant).
  let ligneActuelle: Record<string, unknown> | undefined;
  try {
    const { rows } = await query('SELECT * FROM config_scoring WHERE id = 1');
    ligneActuelle = rows[0];
  } catch {
    return Response.json({ erreurs: [{ colonne: '', message: 'configuration indisponible' }] }, { status: 503 });
  }
  if (!ligneActuelle) {
    return Response.json({ erreurs: [{ colonne: '', message: 'profil absent (aucune ligne id=1)' }] }, { status: 422 });
  }

  // 3. Validation — si KO, rien n'est écrit.
  const validation = validerPatch(patch, ligneActuelle);
  if (!validation.ok) {
    return Response.json({ erreurs: validation.erreurs }, { status: 422 });
  }

  // 4. Écriture atomique (UN seul query) : UPDATE + INSERT journal via CTE.
  const params: unknown[] = [];
  const setSql = validation.set
    .map((item) => {
      // Nom de colonne re-résolu depuis l'allowlist META (jamais la clé brute).
      const colonne = metaParColonne(item.colonne)!.colonne;
      params.push(item.valeur);
      return `"${colonne}" = $${params.length}`;
    })
    .join(', ');
  const jrnlSql = validation.set
    .map((item) => {
      const colonne = metaParColonne(item.colonne)!.colonne;
      const avant = ligneActuelle![colonne];
      params.push(colonne);
      const pCol = params.length;
      params.push(avant === null || avant === undefined ? null : String(avant));
      const pAvant = params.length;
      params.push(String(item.valeur));
      const pApres = params.length;
      return `($${pCol}, $${pAvant}, $${pApres})`;
    })
    .join(', ');

  const sql = `
    WITH upd AS (
      UPDATE config_scoring SET ${setSql} WHERE id = 1 RETURNING *
    ), jrnl AS (
      INSERT INTO config_edit_log (colonne, avant, apres) VALUES ${jrnlSql}
    )
    SELECT * FROM upd;
  `;

  try {
    const { rows } = await query(sql, params);
    const ligneMAJ = rows[0];
    return Response.json({ ok: true, valeurs: ligneMAJ, repli: evaluerRepli(ligneMAJ) });
  } catch {
    return Response.json({ erreurs: [{ colonne: '', message: 'écriture impossible' }] }, { status: 503 });
  }
}
