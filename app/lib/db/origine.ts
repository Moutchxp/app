/**
 * Validation du point d'origine (Mode B — BD TOPO®).
 *
 * Valide un point cliqué sur la carte (lat/lon WGS84) contre les emprises de
 * bâtiments (vue bdtopo_batiment, géométrie L93/2154) et renvoie le bâtiment
 * d'origine + l'altitude du terrain (Mode B = altitude_minimale_sol).
 *
 * Règle métier (snap origine) : un point à l'intérieur de l'emprise OU à <= 1 m à l'extérieur
 * est SNAPPÉ sur la bordure du bâtiment (ST_ClosestPoint sur ST_Boundary) ; au-delà de 1 m →
 * hors bâtiment (indéterminé). Remplace l'ancienne tolérance de 0,30 m.
 */
import { query } from "./client";
import type { PointWgs84, PointL93 } from "../svv/geo";
import type { ModeOrigine } from "../svv/config";

/** Distance max (m) à l'extérieur du bâtiment pour snapper/valider le point (ex-0,30 m). */
const ORIGIN_SNAP_TOLERANCE_M = 1.0;

export interface ValidationOrigine {
  valide: boolean;
  raison: string;
  batimentOrigine: { id: number; cleabs: string; polygoneWkt: string } | null;
  altitudeTerrainOrigineM: number | null; // terrain lu sur le MNT (LiDAR) au point exact ; null si hors couverture MNT / nodata
  altSolBdTopoM?: number | null; // INFORMATIF : altitude_minimale_sol BD TOPO, pour comparaison en test (NON utilisé dans le calcul)
  distanceAuBatimentM: number; // 0 si couvert (intérieur/bordure), sinon distance au bâtiment le plus proche
  dansBatiment: boolean; // true si couvert par l'emprise (intérieur OU bordure, ST_Covers)
  pointSnappeL93: PointL93 | null; // point projeté sur la bordure (L93/2154) ; null si non valide
  pointSnappeWgs84: PointWgs84 | null; // idem en WGS84 (pour l'aval sans re-transformer)
}

interface LigneBatiment {
  id: number;
  cleabs: string;
  alt_sol_bdtopo: number | null; // INFORMATIF : altitude_minimale_sol BD TOPO (non utilisé)
  alt_terrain_mnt: number | null; // terrain MNT LiDAR au point exact (source autoritative)
  dist_m: number;
  couvert: boolean; // ST_Covers (intérieur OU bordure)
  polygone_wkt: string; // emprise L93 (SRID 2154) du bâtiment d'origine, transport pur (non consommé ici)
  snap_x: number; // point snappé sur la bordure — L93
  snap_y: number;
  snap_lon: number; // point snappé — WGS84
  snap_lat: number;
}

export async function validerOrigine(
  point: PointWgs84,
  mode: ModeOrigine = "semi_auto",
): Promise<ValidationOrigine> {
  const res = await query<LigneBatiment>(
    `WITH pt AS (
       SELECT ST_Transform(ST_SetSRID(ST_MakePoint($1, $2), 4326), 2154) AS g
     ),
     nn AS (                                            -- bâtiment le plus proche
       SELECT b.id, b.cleabs, ST_Force2D(b.geom) AS geom, b.altitude_minimale_sol AS alt_sol_bdtopo
       FROM bdtopo_batiment b, pt
       ORDER BY ST_Force2D(b.geom) <-> pt.g
       LIMIT 1
     ),
     snap AS (                                          -- semi_auto : projection bordure ; manuel : point brut tel quel
       SELECT CASE WHEN $3 = 'manuel' THEN pt.g
                   ELSE ST_ClosestPoint(ST_Boundary(nn.geom), pt.g) END AS g
       FROM nn, pt
     )
     SELECT nn.id, nn.cleabs,
            ST_AsText(nn.geom) AS polygone_wkt,
            nn.alt_sol_bdtopo,
            (SELECT ST_Value(m.rast, snap.g)           -- terrain MNT AU POINT SNAPPÉ (S2, option a)
               FROM mnt_lidar_brut m
              WHERE ST_Intersects(m.rast, snap.g)
              LIMIT 1) AS alt_terrain_mnt,
            ST_Distance(nn.geom, pt.g) AS dist_m,
            ST_Covers(nn.geom, pt.g) AS couvert,        -- intérieur OU bordure
            ST_X(snap.g) AS snap_x, ST_Y(snap.g) AS snap_y,
            ST_X(ST_Transform(snap.g, 4326)) AS snap_lon,
            ST_Y(ST_Transform(snap.g, 4326)) AS snap_lat
     FROM nn, pt, snap;`,
    [point.lon, point.lat, mode],
  );

  if (res.rows.length === 0) {
    return {
      valide: false,
      raison: "Aucun bâtiment trouvé.",
      batimentOrigine: null,
      altitudeTerrainOrigineM: null,
      altSolBdTopoM: null,
      distanceAuBatimentM: Infinity,
      dansBatiment: false,
      pointSnappeL93: null,
      pointSnappeWgs84: null,
    };
  }

  const {
    id, cleabs, alt_sol_bdtopo, alt_terrain_mnt, dist_m, couvert, polygone_wkt,
    snap_x, snap_y, snap_lon, snap_lat,
  } = res.rows[0];

  const dansBatiment = couvert; // ST_Covers : intérieur OU bordure
  const distanceAuBatimentM = couvert ? 0 : dist_m;
  // manuel : validable SEULEMENT si couvert (aucune tolérance, aucun snap). semi_auto : inchangé.
  const valide = mode === "manuel" ? couvert : couvert || dist_m <= ORIGIN_SNAP_TOLERANCE_M;

  let raison: string;
  if (mode === "manuel") {
    raison = couvert
      ? "Point validé (mode manuel — point pris tel quel)."
      : `Point hors d'un bâtiment (mode manuel) : à ${dist_m.toFixed(2)} m. Repositionne le marqueur à l'intérieur de votre habitation.`;
  } else if (couvert) {
    raison = "Point sur l'emprise du bâtiment (snappé sur la bordure).";
  } else if (dist_m <= ORIGIN_SNAP_TOLERANCE_M) {
    raison = `Point à ${dist_m.toFixed(2)} m du bâtiment (≤ 1 m, snappé sur la bordure).`;
  } else {
    raison = `Point à ${dist_m.toFixed(2)} m du bâtiment le plus proche : hors tolérance de 1 m. Repositionne le marqueur sur le bâtiment.`;
  }

  return {
    valide,
    raison,
    batimentOrigine: valide ? { id, cleabs, polygoneWkt: polygone_wkt } : null,
    // terrain lu sur le MNT (LiDAR) AU POINT SNAPPÉ (S2, option a) = même cellule 50 cm que le MNS ;
    // null si hors couverture MNT ou nodata -9999 → pas de certificat (garde pipeline l.61-63).
    altitudeTerrainOrigineM: valide ? alt_terrain_mnt : null,
    altSolBdTopoM: alt_sol_bdtopo, // INFORMATIF uniquement (comparaison en test)
    distanceAuBatimentM,
    dansBatiment,
    pointSnappeL93: valide ? { x: snap_x, y: snap_y } : null,
    pointSnappeWgs84: valide ? { lat: snap_lat, lon: snap_lon } : null,
  };
}
