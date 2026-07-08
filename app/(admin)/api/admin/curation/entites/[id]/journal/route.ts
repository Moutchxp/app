import 'server-only';
import { query } from '../../../../../../../lib/db/client';
import { lireId } from '../../../partage';

/** Contexte de route dynamique Next 16 : `params` est un **Promise** (à `await`). */
type Ctx = { params: Promise<{ id: string }> };

/** Ligne du journal (jsonb `avant`/`apres` BRUTS — le client humanise). `id` bigint → string (`pg`). */
interface LigneJournalDB {
  id: string;
  ts: string;
  action: string;
  entite_id: number;
  cleabs: string | null;
  avant: unknown;
  apres: unknown;
  nom_affiche: string;
  famille_affiche: string;
  supprimee: boolean;
}

/**
 * GET /api/admin/curation/entites/[id]/journal — LECTURE SEULE de l'historique d'UNE entité. HJ-1..HJ-18.
 *
 * Lignes de `curation_patrimoine_log` où `entite_id = [id]`, tri `id DESC` (récent → ancien), garde-fou
 * `LIMIT 200`. Même jointure que la route globale (nom/famille de l'entité, ou fallback via la ligne de
 * suppression si l'entité a été supprimée). Renvoie `avant`/`apres` bruts (le renommage / annulation_edition
 * en ont besoin au rendu). GOLDEN-SAFE (journal hors chemin de score). Server-only, gardée `proxy.ts`.
 */
export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const idNum = lireId(id);
  if (idNum === null) {
    return Response.json({ erreurs: [{ message: 'identifiant d’entité invalide' }] }, { status: 422 });
  }
  try {
    const { rows } = await query<LigneJournalDB>(
      `SELECT l.id, l.ts, l.action, l.entite_id, l.cleabs, l.avant, l.apres,
              COALESCE(e.nom, sup.nom, 'entité supprimée #' || l.entite_id) AS nom_affiche,
              COALESCE(e.famille, sup.famille, 'inconnue') AS famille_affiche,
              (e.id IS NULL) AS supprimee
         FROM curation_patrimoine_log l
         LEFT JOIN patrimoine_entite e ON e.id = l.entite_id
         LEFT JOIN LATERAL (
           SELECT s.avant->>'nom' AS nom, s.avant->>'famille' AS famille
             FROM curation_patrimoine_log s
            WHERE s.entite_id = l.entite_id AND s.action = 'suppression_entite_manuelle'
            ORDER BY s.id DESC LIMIT 1
         ) sup ON e.id IS NULL
        WHERE l.entite_id = $1
        ORDER BY l.id DESC
        LIMIT 200`,
      [idNum],
    );

    const premiere = rows[0];
    const entite = premiere
      ? { id: idNum, nom_affiche: premiere.nom_affiche, famille_affiche: premiere.famille_affiche, supprimee: premiere.supprimee }
      : { id: idNum, nom_affiche: `entité #${idNum}`, famille_affiche: 'inconnue', supprimee: false };
    return Response.json({ lignes: rows, entite });
  } catch {
    return Response.json({ erreur: 'journal indisponible' }, { status: 503 });
  }
}
