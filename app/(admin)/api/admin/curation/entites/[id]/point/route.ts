import 'server-only';
import { query } from '../../../../../../../lib/db/client';
import { lireSessionCuration } from '../../../../../../../lib/admin/sessionServeur';
import { exigerCompteActif } from '../../../../../../../lib/admin/garde';
import {
  CURATION_DEPLACEMENT_RAYON_MAX_M,
  CURATION_TOLERANCE_RATTACHEMENT_M,
  MESSAGE_RAYON_DEPASSE,
  lireCorps,
  lireId,
  lireLatLon,
} from '../../../partage';

/**
 * Contexte de route dynamique Next 16 : `params` est un **Promise** (à `await`).
 */
type Ctx = { params: Promise<{ id: string }> };

/** Ligne de contrôle : ancrage + distance (2154) + point effectif avant mutation. */
interface ControleDeplacement {
  a_ancre: boolean;
  dist_m: number | null;
  effectif_avant: string | null;
}

/**
 * PATCH /api/admin/curation/entites/[id]/point — DÉPLACER le point (réversible, borné).
 *
 * Écrit UNIQUEMENT `geom_point_corrige` (jamais `geom_point`, EX-6/EX-20). Body `{lat, lon}` finis,
 * sinon 422. Entité inconnue → 404 ; `geom_point` NULL (pas d'ancre) → 422. Distance mesurée en
 * **Lambert-93/2154** ; si `> CURATION_DEPLACEMENT_RAYON_MAX_M` → 422, RIEN écrit (EX-7). Sinon
 * écriture ATOMIQUE (CTE) : UPDATE `geom_point_corrige` + INVALIDATION de la vérification des liaisons
 * dont l'emprise est désormais à plus de `CURATION_TOLERANCE_RATTACHEMENT_M` (15 m) du nouveau point
 * (`verifie_manuellement=false` ; `detache` et le nombre de liaisons INCHANGÉS) + INSERT journal
 * `action='deplacement'` (traçant les `cleabs` invalidés). `ST_Force2D` conservé. Sous garde `proxy.ts`.
 */
export async function PATCH(request: Request, ctx: Ctx) {
  // Révocation immédiate (M3-0) : compte désactivé / permission retirée → 403 avant toute écriture.
  const refus = await exigerCompteActif(request, 'curation');
  if (refus) return refus;

  const { id } = await ctx.params;
  const idNum = lireId(id);
  if (idNum === null) {
    return Response.json({ erreurs: [{ message: 'identifiant d’entité invalide' }] }, { status: 422 });
  }

  const body = await lireCorps(request);
  if (!body) {
    return Response.json({ erreurs: [{ message: 'corps JSON invalide' }] }, { status: 422 });
  }
  const coords = lireLatLon(body);
  if (!coords) {
    return Response.json({ erreurs: [{ message: 'lat/lon numériques attendus' }] }, { status: 422 });
  }

  // Contrôle : existence, ancrage (`geom_point`), distance 2154, point effectif avant (journal).
  let ctrl: ControleDeplacement | undefined;
  try {
    const { rows } = await query<ControleDeplacement>(
      `SELECT
         (geom_point IS NOT NULL) AS a_ancre,
         CASE WHEN geom_point IS NULL THEN NULL
              ELSE ST_Distance(geom_point, ST_Transform(ST_SetSRID(ST_MakePoint($2, $3), 4326), 2154))
         END AS dist_m,
         ST_AsGeoJSON(ST_Transform(ST_Force2D(COALESCE(geom_point_corrige, geom_point)), 4326)) AS effectif_avant
       FROM patrimoine_entite
       WHERE id = $1`,
      [idNum, coords.lon, coords.lat],
    );
    ctrl = rows[0];
  } catch {
    return Response.json({ erreurs: [{ message: 'entité indisponible' }] }, { status: 503 });
  }

  if (!ctrl) {
    return Response.json({ erreurs: [{ message: 'entité introuvable' }] }, { status: 404 });
  }
  if (!ctrl.a_ancre) {
    return Response.json({ erreurs: [{ message: 'entité sans point d’ancrage (geom_point)' }] }, { status: 422 });
  }
  if (ctrl.dist_m === null || ctrl.dist_m > CURATION_DEPLACEMENT_RAYON_MAX_M) {
    return Response.json({ erreurs: [{ message: MESSAGE_RAYON_DEPASSE }] }, { status: 422 });
  }

  // Écriture atomique (CTE) : UPDATE geom_point_corrige (JAMAIS geom_point) + INVALIDATION des liaisons
  // vérifiées dont l'emprise est désormais à > 15 m du nouveau point (verifie_manuellement=false ;
  // detache et le nombre de liaisons intacts) + INSERT journal (traçant les cleabs invalidés).
  const apres = JSON.stringify({ type: 'Point', coordinates: [coords.lon, coords.lat] });
  const sql = `
    WITH cible AS (
      SELECT ST_Force2D(ST_Transform(ST_SetSRID(ST_MakePoint($2, $3), 4326), 2154)) AS pt
    ), mut AS (
      UPDATE patrimoine_entite
         SET geom_point_corrige = (SELECT pt FROM cible)
       WHERE id = $1
      RETURNING id, ST_AsGeoJSON(ST_Transform(ST_Force2D(geom_point_corrige), 4326)) AS point_corrige
    ), inval AS (
      UPDATE patrimoine_entite_batiment peb
         SET verifie_manuellement = false
       WHERE peb.entite_id = $1
         AND peb.verifie_manuellement
         AND NOT peb.detache
         AND EXISTS (
           SELECT 1 FROM bdtopo_batiment b, cible
            WHERE b.cleabs = peb.cleabs
              AND ST_Distance(ST_Force2D(b.geom), cible.pt) > $6
         )
      RETURNING peb.cleabs
    ), jrnl AS (
      INSERT INTO curation_patrimoine_log (action, entite_id, cleabs, avant, apres, session_jti, session_ouverte_a, utilisateur_id)
      VALUES ('deplacement', $1, NULL, $4::jsonb,
              jsonb_build_object('point', $5::jsonb,
                                 'verifications_invalidees', COALESCE((SELECT jsonb_agg(cleabs) FROM inval), '[]'::jsonb)),
              $7, $8::timestamptz, $9)
    )
    SELECT (SELECT point_corrige FROM mut) AS point_corrige,
           COALESCE((SELECT jsonb_agg(cleabs) FROM inval), '[]'::jsonb) AS invalidees;
  `;
  const session = await lireSessionCuration(request); // traçabilité additive ; null si session illisible
  try {
    const { rows } = await query<{ point_corrige: string | null; invalidees: string[] | null }>(sql, [
      idNum,
      coords.lon,
      coords.lat,
      ctrl.effectif_avant,
      apres,
      CURATION_TOLERANCE_RATTACHEMENT_M,
      session.jti,
      session.iat,
      session.sub,
    ]);
    const maj = rows[0];
    return Response.json({
      ok: true,
      id: idNum,
      corrige: true,
      point: maj?.point_corrige ? (JSON.parse(maj.point_corrige) as unknown) : null,
      verificationsInvalidees: maj?.invalidees ?? [],
    });
  } catch {
    return Response.json({ erreurs: [{ message: 'écriture impossible' }] }, { status: 503 });
  }
}

/**
 * DELETE /api/admin/curation/entites/[id]/point — ANNULER le déplacement (retour à l'original).
 *
 * Remet `geom_point_corrige = NULL` (EX-8). `geom_point` (original) reste intact. Entité inconnue →
 * 404. Écriture ATOMIQUE (CTE) : UPDATE + INSERT journal `action='annulation_deplacement'`.
 */
export async function DELETE(request: Request, ctx: Ctx) {
  // Révocation immédiate (M3-0) : compte désactivé / permission retirée → 403 avant toute écriture.
  const refus = await exigerCompteActif(request, 'curation');
  if (refus) return refus;

  const { id } = await ctx.params;
  const idNum = lireId(id);
  if (idNum === null) {
    return Response.json({ erreurs: [{ message: 'identifiant d’entité invalide' }] }, { status: 422 });
  }

  // Valeur corrigée avant (journal) + existence de l'entité.
  let avant: string | null | undefined;
  let existe = false;
  try {
    const { rows } = await query<{ corrige_avant: string | null }>(
      `SELECT ST_AsGeoJSON(ST_Transform(ST_Force2D(geom_point_corrige), 4326)) AS corrige_avant
         FROM patrimoine_entite WHERE id = $1`,
      [idNum],
    );
    if (rows.length > 0) {
      existe = true;
      avant = rows[0].corrige_avant;
    }
  } catch {
    return Response.json({ erreurs: [{ message: 'entité indisponible' }] }, { status: 503 });
  }
  if (!existe) {
    return Response.json({ erreurs: [{ message: 'entité introuvable' }] }, { status: 404 });
  }

  const sql = `
    WITH mut AS (
      UPDATE patrimoine_entite
         SET geom_point_corrige = NULL
       WHERE id = $1
      RETURNING id
    ), jrnl AS (
      INSERT INTO curation_patrimoine_log (action, entite_id, cleabs, avant, apres, session_jti, session_ouverte_a, utilisateur_id)
      VALUES ('annulation_deplacement', $1, NULL, $2::jsonb, NULL, $3, $4::timestamptz, $5)
    )
    SELECT * FROM mut;
  `;
  const session = await lireSessionCuration(request); // traçabilité additive ; null si session illisible
  try {
    await query(sql, [idNum, avant ?? null, session.jti, session.iat, session.sub]);
    return Response.json({ ok: true, id: idNum, corrige: false });
  } catch {
    return Response.json({ erreurs: [{ message: 'écriture impossible' }] }, { status: 503 });
  }
}
