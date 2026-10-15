/**
 * ══ UNE DALLE LiDAR (MNT) COUVRE-T-ELLE CE POINT ? (lot ZONE SANS LiDAR, 15/10/2026) ═══════════════════════════════════
 *
 * Distingue une zone SANS relevés (aucune tuile MNT ne contient le point) d'un simple trou de valeur (nodata) dans une tuile
 * présente. Même test de couverture que la lecture de l'altitude de l'origine (`origine.ts`) : `ST_Intersects(rast, point)`,
 * précédé du préfiltre de l'index (`ST_ConvexHull(rast) &&`, cf. `lectureRaster.ts`). Lecture seule, une requête indexée.
 * Ne touche ni au moteur ni au verdict : appelée par la route APRÈS l'analyse, quand celle-ci n'a rien rendu.
 */
import { query } from './client';
import type { PointL93 } from '../svv/geo';

/** Fonction de requête (par défaut `query`, le pool applicatif) — le diagnostic passe la sienne (transaction en lecture seule). */
export type Requete = (texte: string, params: unknown[]) => Promise<{ rows: { couvert: boolean }[] }>;

/** `true` si au moins une tuile de `mnt_lidar_brut` contient le point Lambert-93. */
export async function mntSousLePoint(point: PointL93, requete: Requete = (t, p) => query<{ couvert: boolean }>(t, p)): Promise<boolean> {
  const { rows } = await requete(
    `WITH p AS (SELECT ST_SetSRID(ST_MakePoint($1::float8, $2::float8), 2154) AS g)
     SELECT EXISTS (
       SELECT 1 FROM mnt_lidar_brut m, p
        WHERE ST_ConvexHull(m.rast) && p.g AND ST_Intersects(m.rast, p.g)
     ) AS couvert`,
    [point.x, point.y],
  );
  return rows[0]?.couvert === true;
}
