/**
 * Détection d'obstacles sur l'axe principal (Mode B — BD TOPO®).
 *
 * Depuis un point d'origine validé + un azimut, trouve tous les bâtiments
 * coupés par un couloir de 2 m (±1 m) sur ANALYSIS_RANGE_M mètres, ordonnés par
 * distance, et résout leur altitude de toit (NGF) par la cascade Mode B.
 *
 * Produit le tableau ObstacleCandidat[] que premierObstacle consommera.
 * Ne calcule PAS le verdict ici. Aucun arrondi sur les distances.
 *
 * Repère L93 : x = Est, y = Nord. Azimut géographique θ (Nord, sens horaire)
 * → direction (dx, dy) = (sin θ, cos θ).
 */
import { query } from "./client";
import { hauteurLidarMaxNettoye } from "./hauteurLidar";
import type { PointWgs84 } from "../svv/geo";
import type { ObstacleCandidat, SourceHauteur } from "../svv/verdict";
import { ANALYSIS_RANGE_M, CORRIDOR_HALF_WIDTH_M, FLOOR_HEIGHT_M } from "../svv/config";

export interface ParametresAxe {
  point: PointWgs84;
  azimutDeg: number;
  batimentOrigineId: number;
  /**
   * true → enrichir chaque candidat avec la hauteur LiDAR (max nettoyé,
   * source LIDAR_HD) prioritaire sur la cascade BD TOPO. Réservé au COULOIR
   * PRINCIPAL ; les 61 faisceaux laissent ce flag à false (restent BD TOPO).
   */
  lidar?: boolean;
}

interface LigneObstacle {
  id: number;
  cleabs: string;
  dist_m: number;
  amt: number | null; // altitude_maximale_toit
  h: number | null; // hauteur
  sol: number | null; // altitude_minimale_sol
  net: number | null; // nombre_d_etages
  corridor_wkt: string; // WKT L93 du couloir (identique sur toutes les lignes)
  axe_wkt: string; // WKT L93 de l'axe (demi-droite origine→portée)
}

/** Cascade hauteur Mode B → altitude de sommet (NGF) + source. */
function resoudreSommet(r: LigneObstacle): { altitudeSommetM: number | null; source: SourceHauteur } {
  // 1) altitude maximale de toit fournie.
  if (r.amt !== null) {
    return { altitudeSommetM: r.amt, source: "BD_TOPO" };
  }
  // 2) hauteur + altitude minimale du sol.
  if (r.h !== null && r.sol !== null) {
    return { altitudeSommetM: r.sol + r.h, source: "BD_TOPO" };
  }
  // 3) nombre d'étages × hauteur d'étage + altitude minimale du sol.
  if (r.net !== null && r.sol !== null) {
    return { altitudeSommetM: r.sol + r.net * FLOOR_HEIGHT_M, source: "BD_TOPO" };
  }
  // 4) indéterminé.
  return { altitudeSommetM: null, source: "NONE" };
}

export async function obstaclesSurAxe(params: ParametresAxe): Promise<ObstacleCandidat[]> {
  const res = await query<LigneObstacle>(
    `WITH o AS (
       SELECT ST_Transform(ST_SetSRID(ST_MakePoint($1,$2),4326),2154) AS g
     ),
     axe AS (
       SELECT o.g AS origine,
              ST_MakeLine(o.g, ST_Translate(o.g, $4*sin(radians($3)), $4*cos(radians($3)))) AS ligne
       FROM o
     ),
     couloir AS (
       SELECT origine, ligne, ST_Buffer(ligne, $5) AS corr FROM axe
     )
     SELECT b.id, b.cleabs,
            ST_Distance(ST_Force2D(b.geom), c.origine) AS dist_m,
            b.altitude_maximale_toit AS amt, b.hauteur AS h,
            b.altitude_minimale_sol AS sol, b.nombre_d_etages AS net,
            ST_AsText(c.corr) AS corridor_wkt,
            ST_AsText(c.ligne) AS axe_wkt
     FROM bdtopo_batiment b, couloir c
     WHERE ST_Intersects(ST_Force2D(b.geom), c.corr)
       AND b.id <> $6
     ORDER BY dist_m ASC;`,
    [
      params.point.lon,
      params.point.lat,
      params.azimutDeg,
      ANALYSIS_RANGE_M,
      CORRIDOR_HALF_WIDTH_M,
      params.batimentOrigineId,
    ],
  );

  return Promise.all(
    res.rows.map(async (r): Promise<ObstacleCandidat> => {
      // Couloir principal : LiDAR (max nettoyé) prioritaire sur la cascade BD TOPO.
      if (params.lidar) {
        const lidar = await hauteurLidarMaxNettoye({
          batimentId: r.id,
          corridorWkt: r.corridor_wkt,
          axisLineWkt: r.axe_wkt,
        });
        if (lidar.hauteurM !== null) {
          return { distanceM: r.dist_m, altitudeSommetM: lidar.hauteurM, source: "LIDAR_HD" };
        }
      }
      // Repli cascade BD TOPO (ou NONE).
      const { altitudeSommetM, source } = resoudreSommet(r);
      return { distanceM: r.dist_m, altitudeSommetM, source };
    }),
  );
}
