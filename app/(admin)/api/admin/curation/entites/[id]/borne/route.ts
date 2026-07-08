import 'server-only';
import { query } from '../../../../../../../lib/db/client';
import { lireId } from '../../../partage';

/** Contexte de route dynamique Next 16 : `params` est un **Promise** (à `await`). */
type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/curation/entites/[id]/borne — `max(id)` du journal `curation_patrimoine_log` pour cette
 * entité (0 si aucune ligne). Capturé par l'UI à l'OUVERTURE d'une carte : sert de `borne` au rollback
 * (`annuler-edition`). Lecture seule, server-only, sous garde `proxy.ts`. GOLDEN-SAFE (journal hors score).
 */
export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const idNum = lireId(id);
  if (idNum === null) {
    return Response.json({ erreurs: [{ message: 'identifiant d’entité invalide' }] }, { status: 422 });
  }
  try {
    const { rows } = await query<{ borne: string }>(
      `SELECT COALESCE(MAX(id), 0) AS borne FROM curation_patrimoine_log WHERE entite_id = $1`,
      [idNum],
    );
    return Response.json({ borne: Number(rows[0]?.borne ?? 0) });
  } catch {
    return Response.json({ erreur: 'borne indisponible' }, { status: 503 });
  }
}
