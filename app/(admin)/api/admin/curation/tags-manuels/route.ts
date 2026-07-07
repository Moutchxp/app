import 'server-only';
import { query } from '../../../../../lib/db/client';

/** Ligne brute : entité manuelle + centroïde (4326) de son 1er polygone rattaché. */
interface LigneTagManuel {
  entite_id: number;
  nom: string | null;
  centre: string | null;
}

/**
 * GET /api/admin/curation/tags-manuels — LECTURE SEULE. Pour chaque entité `origine='manuel'` ayant
 * ≥1 liaison active (`actif AND NOT detache`) : `entite_id`, `nom`, et le **centroïde 4326 du 1er
 * polygone** (liaison au `created` le plus ancien, `cleabs` en tiebreak).
 *
 * SANS filtre bbox ni LIMIT (≈ 1 ligne par tag manuel, très léger) → permet une couche d'étoiles
 * PERSISTANTE à tout zoom, indépendante de la bbox (contrairement à `/emprises`, plafonné à 500).
 * `ST_Force2D` conservé ; géométrie moteur 2154 → 4326 pour l'affichage Leaflet. Sous garde `proxy.ts`.
 */
export async function GET() {
  try {
    const { rows } = await query<LigneTagManuel>(
      `SELECT pe.id AS entite_id, pe.nom,
              ST_AsGeoJSON(ST_Transform(ST_Centroid(ST_Force2D(prem.geom)), 4326)) AS centre
         FROM patrimoine_entite pe
         JOIN LATERAL (
           SELECT b.geom
             FROM patrimoine_entite_batiment peb
             JOIN bdtopo_batiment b ON b.cleabs = peb.cleabs
            WHERE peb.entite_id = pe.id AND peb.actif AND NOT peb.detache
            ORDER BY peb.created, peb.cleabs
            LIMIT 1
         ) prem ON true
        WHERE pe.meta->>'origine' = 'manuel'`,
    );
    const tags = rows.map((r) => ({
      entiteId: r.entite_id,
      nom: r.nom,
      centre: r.centre ? (JSON.parse(r.centre) as unknown) : null,
    }));
    return Response.json({ tags });
  } catch {
    return Response.json({ erreur: 'tags manuels indisponibles' }, { status: 503 });
  }
}
