import 'server-only';
import { query } from '../../../../../lib/db/client';
import { lireBbox } from '../partage';

/**
 * PARC-3 — Plafond du CALQUE parcelle par bbox. CHOISI SUR MESURE (pas au jugé) : une bbox Paris DENSE contient ~977 parcelles
 * (mesuré) ; 1 500 couvre les vues urbaines denses avec marge tout en bornant le PAYLOAD transporté (la géométrie, pas le temps
 * SQL ~29 ms, est le coût dominant : ~0,18 Mo pour ~1 000 parcelles en géométrie simplifiée). Au-delà, l'affichage est TRONQUÉ
 * (`tronque:true`) — jamais silencieusement : le client invite à zoomer. Miroir du plafond `LIMIT 500` du bâti (route emprises).
 */
const LIMITE_PARCELLES = 1500;

/**
 * PARC-3 — TOLÉRANCE de simplification POUR L'AFFICHAGE SEULEMENT (mètres, en Lambert-93 avant reprojection). La géométrie
 * renvoyée par CETTE route est ALLÉGÉE pour le tracé du calque (payload brut 332 Ko → 175 Ko à 1 m, mesuré). ⚠️ Simplification
 * d'AFFICHAGE UNIQUEMENT : jamais écrite en base, jamais réutilisée dans un calcul (distances/verdict lisent la géométrie brute
 * ailleurs). `ST_SimplifyPreserveTopology` conserve un contour valide (pas de trous ni d'auto-intersections).
 */
const SIMPLIFY_AFFICHAGE_M = 1.0;

/**
 * GET /api/admin/curation/parcelles?minlon&minlat&maxlon&maxlat — LECTURE SEULE des CONTOURS de parcelles d'une bbox (WGS84),
 * pour le calque de repérage visuel (PARC-3). Par parcelle : `id` (IDU), contour GeoJSON SIMPLIFIÉ POUR L'AFFICHAGE, et `citee`
 * = la parcelle est citée par ≥ 1 dossier Sitadel (`EXISTS permis_parcelle.idu = parcelle.id`). N'AJOUTE AUCUNE donnée : même
 * information que la bulle du bâtiment (PARC-2), juste repérée à la parcelle. Filtre spatial via l'index gist (`geom && enveloppe`)
 * en 2154, `ST_Force2D` conservé. Bornée à `LIMITE_PARCELLES` (`tronque` signalé). Bbox invalide → 422. Sous garde `proxy.ts`.
 * N'entre dans AUCUN calcul de verdict/score. Le calque ÉTEINT n'appelle jamais cette route (garde côté client).
 */
export async function GET(request: Request) {
  const bbox = lireBbox(new URL(request.url).searchParams);
  if (!bbox) {
    return Response.json({ erreurs: [{ message: 'bbox invalide (minlon/minlat/maxlon/maxlat)' }] }, { status: 422 });
  }

  try {
    const { rows } = await query<{ id: string; geom: string | null; citee: boolean }>(
      `SELECT pa.id,
              ST_AsGeoJSON(ST_Transform(ST_Force2D(ST_SimplifyPreserveTopology(pa.geom, ${SIMPLIFY_AFFICHAGE_M})), 4326), 6) AS geom,
              EXISTS (SELECT 1 FROM permis_parcelle pp WHERE pp.idu = pa.id) AS citee
         FROM parcelle pa
        WHERE pa.geom && ST_Transform(ST_MakeEnvelope($1, $2, $3, $4, 4326), 2154)
        LIMIT ${LIMITE_PARCELLES}`,
      [bbox.minlon, bbox.minlat, bbox.maxlon, bbox.maxlat],
    );
    return Response.json({
      parcelles: rows.map((r) => ({
        id: r.id,
        geom: r.geom ? (JSON.parse(r.geom) as unknown) : null,
        citee: r.citee,
      })),
      // Pas de troncature SILENCIEUSE : le client sait que le calque est incomplet et invite à zoomer.
      tronque: rows.length >= LIMITE_PARCELLES,
    });
  } catch {
    return Response.json({ erreur: 'parcelles indisponibles' }, { status: 503 });
  }
}
