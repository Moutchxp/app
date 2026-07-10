import 'server-only';
import { query } from '../../../../../lib/db/client';
import { lireBbox, versEmprise, type LigneEmpriseDB } from '../partage';

/** Plafond de sécurité : nombre d'emprises renvoyées pour une bbox (aide UI, LECTURE SEULE). */
const LIMITE_EMPRISES = 500;

/**
 * GET /api/admin/curation/emprises?minlon&minlat&maxlon&maxlat — LECTURE SEULE des emprises
 * `bdtopo_batiment` dans une bbox (WGS84), pour permettre le clic de rattachement côté carte.
 *
 * `cleabs` + géométrie `ST_AsGeoJSON(ST_Transform(ST_Force2D(geom), 4326))` + `annee` (année de
 * construction, `bdnb_annee_batiment` en LEFT JOIN par `cleabs` — même patron que `obstacles.ts`,
 * PK `cleabs`, relation 1:0/1 → AUCUNE multiplication de lignes, ZÉRO requête supplémentaire) +
 * `etages` (`nombre_d_etages`, colonne de `bdtopo_batiment` DÉJÀ lue avec `geom` → AUCUN JOIN nouveau,
 * le plan d'exécution est identique, seule la largeur de ligne augmente). Le LEFT JOIN n'EXCLUT aucun
 * bâtiment sans année, et `etages` est `null` si non renseigné (`0` reste une VRAIE valeur distincte).
 * Année et étages sont une aide UI (bulle), en LECTURE SEULE : elles n'entrent dans AUCUN calcul de
 * verdict ni de score de cette route (le moteur lit `nombre_d_etages` ailleurs, pour le score ; ici on
 * ne fait que l'afficher).
 *
 * Filtre spatial via l'index (`geom && enveloppe`) en 2154. `LIMIT 500`. Bbox invalide → 422. Sous
 * garde `proxy.ts`.
 */
export async function GET(request: Request) {
  const bbox = lireBbox(new URL(request.url).searchParams);
  if (!bbox) {
    return Response.json({ erreurs: [{ message: 'bbox invalide (minlon/minlat/maxlon/maxlat)' }] }, { status: 422 });
  }

  try {
    const { rows } = await query<LigneEmpriseDB>(
      `SELECT b.cleabs, ST_AsGeoJSON(ST_Transform(ST_Force2D(b.geom), 4326)) AS geom,
              ba.annee_construction AS annee, b.nombre_d_etages AS etages
         FROM bdtopo_batiment b
         LEFT JOIN bdnb_annee_batiment ba ON ba.cleabs = b.cleabs
        WHERE b.geom && ST_Transform(ST_MakeEnvelope($1, $2, $3, $4, 4326), 2154)
        LIMIT ${LIMITE_EMPRISES}`,
      [bbox.minlon, bbox.minlat, bbox.maxlon, bbox.maxlat],
    );
    return Response.json({ emprises: rows.map(versEmprise) });
  } catch {
    return Response.json({ erreur: 'emprises indisponibles' }, { status: 503 });
  }
}
