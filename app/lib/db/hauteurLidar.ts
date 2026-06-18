/**
 * Hauteur LiDAR (Mode A) — max nettoyé sur le couloir principal.
 *
 * Pour un bâtiment candidat et le couloir d'analyse (WKT L93), calcule la
 * hauteur opérationnelle = MAX du profil MNS nettoyé, conformément à
 * SPEC_module_hauteurs_v3.md §3 bis :
 *  - confinement : (emprise ∩ couloir) érodé de -LIDAR_EROSION_M (écarte la
 *    façade/parapet) ; repli sur le polygone plein si trop peu de pixels ;
 *  - anti-pic : on retire les pixels > P95 + LIDAR_SPIKE_OVER_P95_M s'ils sont
 *    une faible fraction (< 10 %) ;
 *  - hauteur = max des valeurs restantes (faîtage nettoyé).
 *
 * Le max est robuste à la contamination de façade : les pixels bas n'abaissent
 * jamais le max. Aucun arrondi.
 */
import { query } from "./client";
import {
  LIDAR_EROSION_M,
  LIDAR_SPIKE_OVER_P95_M,
  LIDAR_MIN_PX,
} from "../svv/config";

export interface HauteurLidar {
  hauteurM: number | null;
  npx: number;
  eroded: boolean;
  picsRetires: number;
}

/** percentile_cont (interpolation linéaire) sur un tableau trié croissant. */
function percentileCont(sortedAsc: number[], p: number): number {
  const n = sortedAsc.length;
  if (n === 0) return NaN;
  if (n === 1) return sortedAsc[0];
  const rank = p * (n - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (rank - lo) * (sortedAsc[hi] - sortedAsc[lo]);
}

/** Échantillon de pixels MNS sur la zone (érodée ou polygone plein). */
async function echantillon(
  batimentId: number,
  corridorWkt: string,
  eroded: boolean,
): Promise<number[]> {
  const zoneExpr = eroded
    ? "ST_Intersection(ST_Buffer(b.g, $3), corr.g)"
    : "ST_Intersection(b.g, corr.g)";
  const params: unknown[] = eroded
    ? [batimentId, corridorWkt, -LIDAR_EROSION_M]
    : [batimentId, corridorWkt];

  const res = await query<{ val: number }>(
    `WITH b AS (SELECT ST_Force2D(geom) AS g FROM bdtopo_batiment WHERE id = $1),
     corr AS (SELECT ST_GeomFromText($2, 2154) AS g),
     zone AS (SELECT ${zoneExpr} AS z FROM b, corr),
     clipped AS (
       SELECT ST_Clip(r.rast, zone.z, true) AS rast
       FROM mns_lidar_brut r, zone
       WHERE ST_Intersects(r.rast, zone.z)
     )
     SELECT pc.val AS val
     FROM clipped, LATERAL ST_PixelAsCentroids(clipped.rast) AS pc
     WHERE pc.val IS NOT NULL AND pc.val <> -9999;`,
    params,
  );
  return res.rows.map((r) => Number(r.val));
}

export async function hauteurLidarMaxNettoye({
  batimentId,
  corridorWkt,
}: {
  batimentId: number;
  corridorWkt: string;
}): Promise<HauteurLidar> {
  // Zone érodée d'abord ; repli sur le polygone plein si trop peu de pixels.
  let eroded = true;
  let vals = await echantillon(batimentId, corridorWkt, true);
  if (vals.length < LIDAR_MIN_PX) {
    vals = await echantillon(batimentId, corridorWkt, false);
    eroded = false;
  }

  const npx = vals.length;
  if (npx === 0) {
    return { hauteurM: null, npx: 0, eroded, picsRetires: 0 };
  }

  // Anti-pic : exclure les pics ponctuels (> P95 + seuil) si fraction < 10 %.
  const sorted = [...vals].sort((a, b) => a - b);
  const seuil = percentileCont(sorted, 0.95) + LIDAR_SPIKE_OVER_P95_M;
  const hauts = vals.filter((v) => v > seuil).length;
  let kept = vals;
  let picsRetires = 0;
  if (hauts > 0 && hauts < 0.1 * npx) {
    kept = vals.filter((v) => v <= seuil);
    picsRetires = hauts;
  }

  const hauteurM = kept.length ? Math.max(...kept) : null;
  return { hauteurM, npx, eroded, picsRetires };
}
