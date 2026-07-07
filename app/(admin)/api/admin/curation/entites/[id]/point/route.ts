import 'server-only';
import { query } from '../../../../../../../lib/db/client';
import {
  CURATION_DEPLACEMENT_RAYON_MAX_M,
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
 * écriture ATOMIQUE (CTE) : UPDATE `geom_point_corrige` + INSERT journal `action='deplacement'`.
 * `ST_Force2D` conservé. Sous garde `proxy.ts`.
 */
export async function PATCH(request: Request, ctx: Ctx) {
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

  // Écriture atomique : UPDATE geom_point_corrige (JAMAIS geom_point) + INSERT journal via CTE.
  const apres = JSON.stringify({ type: 'Point', coordinates: [coords.lon, coords.lat] });
  const sql = `
    WITH mut AS (
      UPDATE patrimoine_entite
         SET geom_point_corrige = ST_Force2D(ST_Transform(ST_SetSRID(ST_MakePoint($2, $3), 4326), 2154))
       WHERE id = $1
      RETURNING id, ST_AsGeoJSON(ST_Transform(ST_Force2D(geom_point_corrige), 4326)) AS point_corrige
    ), jrnl AS (
      INSERT INTO curation_patrimoine_log (action, entite_id, cleabs, avant, apres)
      VALUES ('deplacement', $1, NULL, $4::jsonb, $5::jsonb)
    )
    SELECT * FROM mut;
  `;
  try {
    const { rows } = await query<{ id: number; point_corrige: string | null }>(sql, [
      idNum,
      coords.lon,
      coords.lat,
      ctrl.effectif_avant,
      apres,
    ]);
    const maj = rows[0];
    return Response.json({
      ok: true,
      id: idNum,
      corrige: true,
      point: maj?.point_corrige ? (JSON.parse(maj.point_corrige) as unknown) : null,
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
export async function DELETE(_request: Request, ctx: Ctx) {
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
      INSERT INTO curation_patrimoine_log (action, entite_id, cleabs, avant, apres)
      VALUES ('annulation_deplacement', $1, NULL, $2::jsonb, NULL)
    )
    SELECT * FROM mut;
  `;
  try {
    await query(sql, [idNum, avant ?? null]);
    return Response.json({ ok: true, id: idNum, corrige: false });
  } catch {
    return Response.json({ erreurs: [{ message: 'écriture impossible' }] }, { status: 503 });
  }
}
