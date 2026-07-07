import 'server-only';
import { query } from '../../../../../lib/db/client';
import { versEntite, compteursParEtat, type LigneEntiteDB } from '../partage';

/**
 * GET /api/admin/curation/entites — LECTURE SEULE des entités patrimoine + leurs liaisons.
 *
 * Par entité : `id, famille, ref_code, nom, statut`, **point effectif**
 * `COALESCE(geom_point_corrige, geom_point)` projeté en **4326** (null si aucune ancre), un booléen
 * `corrige` (`geom_point_corrige` non null), l'**état** dérivé (rouge/orange/vert, cf. `etatEntite`)
 * et la liste des liaisons (`cleabs, source, actif, detache, verifie_manuellement`). Compteurs par
 * état. `ST_Force2D` conservé. Route gardée par `proxy.ts` (sans session → 401). Runtime Node.
 */
const SELECT_ENTITES = `
  SELECT
    e.id,
    e.famille,
    e.ref_code,
    e.nom,
    e.statut,
    ST_AsGeoJSON(ST_Transform(ST_Force2D(COALESCE(e.geom_point_corrige, e.geom_point)), 4326)) AS point_geojson,
    (e.geom_point_corrige IS NOT NULL) AS corrige,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'cleabs', peb.cleabs,
          'source', peb.source,
          'actif', peb.actif,
          'detache', peb.detache,
          'verifie_manuellement', peb.verifie_manuellement
        ) ORDER BY peb.cleabs
      ) FILTER (WHERE peb.cleabs IS NOT NULL),
      '[]'::jsonb
    ) AS liaisons
  FROM patrimoine_entite e
  LEFT JOIN patrimoine_entite_batiment peb ON peb.entite_id = e.id
  GROUP BY e.id
  ORDER BY e.id
`;

export async function GET() {
  try {
    const { rows } = await query<LigneEntiteDB>(SELECT_ENTITES);
    const entites = rows.map(versEntite);
    const compteurs = compteursParEtat(entites.map((e) => e.etat));
    return Response.json({ entites, compteurs });
  } catch {
    return Response.json({ erreur: 'entités indisponibles' }, { status: 503 });
  }
}
