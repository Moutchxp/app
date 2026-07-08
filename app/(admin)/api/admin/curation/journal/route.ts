import 'server-only';
import { query } from '../../../../../lib/db/client';

/**
 * Ligne du journal renvoyée par la lecture (jsonb `avant`/`apres` BRUTS — le client humanise). `id`/`total`
 * sont des bigint → sérialisés en string par `pg`.
 */
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
  total?: string;
}

const FAMILLES = ['inventaire', 'mh', 'mondial'] as const;

/**
 * GET /api/admin/curation/journal — LECTURE SEULE de l'historique GLOBAL (toutes entités). HJ-3..HJ-18.
 *
 * Query : `famille` (inventaire|mh|mondial|toutes, défaut toutes), `ordre` (desc|asc, défaut desc),
 * `limit` (défaut 50, clamp [1;200]), `offset` (défaut 0, ≥0). Jointure `patrimoine_entite` (nom/famille
 * si l'entité existe) + LATERAL sur la ligne `suppression_entite_manuelle` (fallback nom/famille d'une
 * entité SUPPRIMÉE — le journal survit, pas de FK). Une entité « inconnue » n'apparaît que sous « toutes »
 * (OQ-4). GOLDEN-SAFE : `curation_patrimoine_log` n'est lu par aucun chemin de score. Server-only, gardée
 * `proxy.ts`, runtime Node, LECTURE STRICTE (aucune écriture).
 */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;

  const familleParam = sp.get('famille');
  const famille = (FAMILLES as readonly string[]).includes(familleParam ?? '') ? familleParam! : 'toutes';

  const direction = sp.get('ordre') === 'asc' ? 'ASC' : 'DESC'; // whitelist → interpolation sûre
  const ordre = direction === 'ASC' ? 'asc' : 'desc';

  const limitRaw = Number(sp.get('limit'));
  const limit = Number.isInteger(limitRaw) && limitRaw >= 1 ? Math.min(limitRaw, 200) : 50;
  const offsetRaw = Number(sp.get('offset'));
  const offset = Number.isInteger(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

  try {
    const { rows } = await query<LigneJournalDB>(
      `SELECT l.id, l.ts, l.action, l.entite_id, l.cleabs, l.avant, l.apres,
              COALESCE(e.nom, sup.nom, 'entité supprimée #' || l.entite_id) AS nom_affiche,
              COALESCE(e.famille, sup.famille, 'inconnue') AS famille_affiche,
              (e.id IS NULL) AS supprimee,
              count(*) OVER() AS total
         FROM curation_patrimoine_log l
         LEFT JOIN patrimoine_entite e ON e.id = l.entite_id
         LEFT JOIN LATERAL (   -- entité supprimée : nom/famille récupérés dans sa ligne de suppression
           SELECT s.avant->>'nom' AS nom, s.avant->>'famille' AS famille
             FROM curation_patrimoine_log s
            WHERE s.entite_id = l.entite_id AND s.action = 'suppression_entite_manuelle'
            ORDER BY s.id DESC LIMIT 1
         ) sup ON e.id IS NULL
        WHERE ($1 = 'toutes' OR COALESCE(e.famille, sup.famille) = $1)
        ORDER BY l.id ${direction}
        LIMIT $2 OFFSET $3`,
      [famille, limit, offset],
    );

    const total = rows.length > 0 ? Number(rows[0].total) : 0;
    // `total` (window count) retiré de chaque ligne — reconstruction explicite (pas de rest-sibling inutilisé).
    const lignes = rows.map((r) => ({
      id: r.id,
      ts: r.ts,
      action: r.action,
      entite_id: r.entite_id,
      cleabs: r.cleabs,
      avant: r.avant,
      apres: r.apres,
      nom_affiche: r.nom_affiche,
      famille_affiche: r.famille_affiche,
      supprimee: r.supprimee,
    }));
    return Response.json({ lignes, total, limit, offset, ordre, famille });
  } catch {
    return Response.json({ erreur: 'journal indisponible' }, { status: 503 });
  }
}
