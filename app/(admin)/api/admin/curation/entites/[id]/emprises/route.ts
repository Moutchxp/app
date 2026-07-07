import 'server-only';
import { query } from '../../../../../../../lib/db/client';
import { lireId, versEmprise, type LigneEmpriseDB } from '../../../partage';

/**
 * Contexte de route dynamique Next 16 : `params` est un **Promise** (à `await`).
 */
type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/curation/entites/[id]/emprises — LECTURE SEULE des emprises `bdtopo_batiment`
 * RATTACHÉES à l'entité (liaisons **non détachées**), INDÉPENDAMMENT de la bbox visible.
 *
 * Permet à la carte de peindre en VERT UNIFORME toutes les emprises composant un monument (ex.
 * Notre-Dame = 9 polygones), de façon persistante — même hors du champ de vision (Correction 3).
 * `cleabs` + géométrie `ST_AsGeoJSON(ST_Transform(ST_Force2D(geom), 4326))`. Identifiant invalide →
 * 422. Sous garde `proxy.ts`. Aucune écriture.
 */
export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const idNum = lireId(id);
  if (idNum === null) {
    return Response.json({ erreurs: [{ message: 'identifiant d’entité invalide' }] }, { status: 422 });
  }

  try {
    const { rows } = await query<LigneEmpriseDB>(
      `SELECT b.cleabs, ST_AsGeoJSON(ST_Transform(ST_Force2D(b.geom), 4326)) AS geom
         FROM patrimoine_entite_batiment peb
         JOIN bdtopo_batiment b ON b.cleabs = peb.cleabs
        WHERE peb.entite_id = $1 AND NOT peb.detache`,
      [idNum],
    );
    return Response.json({ emprises: rows.map(versEmprise) });
  } catch {
    return Response.json({ erreur: 'emprises indisponibles' }, { status: 503 });
  }
}
