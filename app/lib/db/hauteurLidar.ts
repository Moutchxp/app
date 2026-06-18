/**
 * Hauteur LiDAR (Mode A) — max nettoyé + profil le long du couloir.
 *
 * Pour un bâtiment candidat et le couloir d'analyse (WKT L93), calcule :
 *  - la hauteur opérationnelle = MAX du profil MNS nettoyé (faîtage) ;
 *  - le profil ProfilPoint[] (distance le long de l'axe → altitude toit nettoyée),
 *    binné à LIDAR_PROFIL_BIN_M, à partir du MÊME jeu de pixels nettoyés ;
 *  - dFacadeM = distance le long de l'axe du point d'entrée de l'axe dans
 *    l'emprise pleine (exact, indépendant de l'érosion).
 *
 * Réf : SPEC_module_hauteurs_v3.md §3 bis. Anti-pic AVANT le binning. Aucun
 * arrondi. Le max reste robuste à la contamination de façade.
 */
import { query } from "./client";
import type { ProfilPoint } from "../svv/contact";
import {
  LIDAR_EROSION_M,
  LIDAR_SPIKE_OVER_P95_M,
  LIDAR_MIN_PX,
  LIDAR_PROFIL_BIN_M,
} from "../svv/config";

export interface HauteurLidar {
  hauteurM: number | null;
  npx: number;
  eroded: boolean;
  picsRetires: number;
  dFacadeM: number | null;
  profil: ProfilPoint[];
}

interface PixelEchantillon {
  val: number;
  distAlong: number;
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

/** Échantillon de pixels MNS (val + distance le long de l'axe) sur la zone. */
async function echantillon(
  batimentId: number,
  corridorWkt: string,
  axisLineWkt: string,
  eroded: boolean,
): Promise<PixelEchantillon[]> {
  const zoneExpr = eroded
    ? "ST_Intersection(ST_Buffer(b.g, $3), corr.g)"
    : "ST_Intersection(b.g, corr.g)";
  const axParam = eroded ? "$4" : "$3";
  const params: unknown[] = eroded
    ? [batimentId, corridorWkt, -LIDAR_EROSION_M, axisLineWkt]
    : [batimentId, corridorWkt, axisLineWkt];

  const res = await query<{ val: number; dist_along: number }>(
    `WITH b AS (SELECT ST_Force2D(geom) AS g FROM bdtopo_batiment WHERE id = $1),
     corr AS (SELECT ST_GeomFromText($2, 2154) AS g),
     ax AS (SELECT ST_GeomFromText(${axParam}, 2154) AS g),
     zone AS (SELECT ${zoneExpr} AS z FROM b, corr),
     clipped AS (
       SELECT ST_Clip(r.rast, zone.z, true) AS rast
       FROM mns_lidar_brut r, zone
       WHERE ST_Intersects(r.rast, zone.z)
     )
     SELECT pc.val AS val,
            ST_LineLocatePoint(ax.g, pc.geom) * ST_Length(ax.g) AS dist_along
     FROM clipped, LATERAL ST_PixelAsCentroids(clipped.rast) AS pc, ax
     WHERE pc.val IS NOT NULL AND pc.val <> -9999;`,
    params,
  );
  return res.rows.map((r) => ({ val: Number(r.val), distAlong: Number(r.dist_along) }));
}

/**
 * Distance le long de l'axe de l'ENTRÉE du bâtiment DANS LE COULOIR (emprise
 * pleine). = plus petite coordonnée le long de l'axe parmi les sommets de
 * (couloir ∩ emprise) ∪ (axe ∩ emprise). Géométrique, indépendant de l'érosion.
 * Repli ST_ClosestPoint si l'intersection est vide. Même règle de mesure que
 * le franchissement, pour que le milieu soit cohérent.
 */
async function dFacadeAlongAxis(
  batimentId: number,
  axisLineWkt: string,
  corridorWkt: string,
): Promise<number | null> {
  const res = await query<{ d: number | null }>(
    `WITH a AS (SELECT ST_GeomFromText($2, 2154) AS g),
     b AS (SELECT ST_Force2D(geom) AS g FROM bdtopo_batiment WHERE id = $1),
     corr AS (SELECT ST_GeomFromText($3, 2154) AS g),
     inter AS (
       SELECT ST_Union(ST_Intersection(corr.g, b.g), ST_Intersection(a.g, b.g)) AS ig
       FROM a, b, corr
     ),
     pts AS (
       SELECT (ST_DumpPoints(inter.ig)).geom AS p FROM inter WHERE NOT ST_IsEmpty(inter.ig)
     )
     SELECT COALESCE(
              (SELECT MIN(ST_LineLocatePoint(a.g, pts.p)) FROM pts, a),
              (SELECT ST_LineLocatePoint(a.g, ST_ClosestPoint(a.g, b.g)) FROM a, b)
            ) * (SELECT ST_Length(a.g) FROM a) AS d;`,
    [batimentId, axisLineWkt, corridorWkt],
  );
  const d = res.rows[0]?.d;
  return d === null || d === undefined ? null : Number(d);
}

/** Binning du profil : max des val par tranche de LIDAR_PROFIL_BIN_M, trié par distM. */
function binner(pixels: PixelEchantillon[]): ProfilPoint[] {
  const bins = new Map<number, number>();
  for (const p of pixels) {
    const idx = Math.floor(p.distAlong / LIDAR_PROFIL_BIN_M);
    const prev = bins.get(idx);
    if (prev === undefined || p.val > prev) bins.set(idx, p.val);
  }
  return [...bins.entries()]
    .map(([idx, altM]) => ({ distM: (idx + 0.5) * LIDAR_PROFIL_BIN_M, altM }))
    .sort((a, b) => a.distM - b.distM);
}

export async function hauteurLidarMaxNettoye({
  batimentId,
  corridorWkt,
  axisLineWkt,
}: {
  batimentId: number;
  corridorWkt: string;
  axisLineWkt: string;
}): Promise<HauteurLidar> {
  const dFacadeM = await dFacadeAlongAxis(batimentId, axisLineWkt, corridorWkt);

  // Zone érodée d'abord ; repli sur le polygone plein si trop peu de pixels.
  let eroded = true;
  let pixels = await echantillon(batimentId, corridorWkt, axisLineWkt, true);
  if (pixels.length < LIDAR_MIN_PX) {
    pixels = await echantillon(batimentId, corridorWkt, axisLineWkt, false);
    eroded = false;
  }

  const npx = pixels.length;
  if (npx === 0) {
    return { hauteurM: null, npx: 0, eroded, picsRetires: 0, dFacadeM, profil: [] };
  }

  // Anti-pic AVANT le binning : retirer les pics ponctuels (> P95 + seuil, < 10 %).
  const sortedVals = pixels.map((p) => p.val).sort((a, b) => a - b);
  const seuil = percentileCont(sortedVals, 0.95) + LIDAR_SPIKE_OVER_P95_M;
  const hauts = pixels.filter((p) => p.val > seuil).length;
  let kept = pixels;
  let picsRetires = 0;
  if (hauts > 0 && hauts < 0.1 * npx) {
    kept = pixels.filter((p) => p.val <= seuil);
    picsRetires = hauts;
  }

  const hauteurM = kept.length ? Math.max(...kept.map((p) => p.val)) : null;
  const profil = binner(kept);
  return { hauteurM, npx, eroded, picsRetires, dFacadeM, profil };
}
