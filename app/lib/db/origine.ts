/**
 * Validation du point d'origine (Mode B — BD TOPO®).
 *
 * Valide un point cliqué sur la carte (lat/lon WGS84) contre les emprises de
 * bâtiments (vue bdtopo_batiment, géométrie L93/2154) et renvoie le bâtiment
 * d'origine + l'altitude du terrain (Mode B = altitude_minimale_sol).
 *
 * Règle métier (CLAUDE.md « Point d'origine ») : le point doit être à
 * l'intérieur d'une emprise, avec une tolérance sortante max de 0,30 m.
 */
import { query } from "./client";
import type { PointWgs84 } from "../svv/geo";
import { ORIGIN_OUTSIDE_TOLERANCE_M } from "../svv/config";

export interface ValidationOrigine {
  valide: boolean;
  raison: string;
  batimentOrigine: { id: number; cleabs: string } | null;
  altitudeTerrainOrigineM: number | null; // terrain lu sur le MNT (LiDAR) au point exact ; null si hors couverture MNT / nodata
  altSolBdTopoM?: number | null; // INFORMATIF : altitude_minimale_sol BD TOPO, pour comparaison en test (NON utilisé dans le calcul)
  distanceAuBatimentM: number; // 0 si à l'intérieur, sinon distance au bâtiment le plus proche
  dansBatiment: boolean; // true si strictement à l'intérieur d'une emprise
}

interface LigneBatiment {
  id: number;
  cleabs: string;
  alt_sol_bdtopo: number | null; // INFORMATIF : altitude_minimale_sol BD TOPO (non utilisé)
  alt_terrain_mnt: number | null; // terrain MNT LiDAR au point exact (source autoritative)
  dist_m: number;
  dedans: boolean;
}

export async function validerOrigine(point: PointWgs84): Promise<ValidationOrigine> {
  const res = await query<LigneBatiment>(
    `WITH pt AS (
       SELECT ST_Transform(ST_SetSRID(ST_MakePoint($1, $2), 4326), 2154) AS g
     )
     SELECT b.id, b.cleabs,
            b.altitude_minimale_sol AS alt_sol_bdtopo,
            (SELECT ST_Value(m.rast, pt.g)
               FROM mnt_lidar_brut m
              WHERE ST_Intersects(m.rast, pt.g)
              LIMIT 1) AS alt_terrain_mnt,
            ST_Distance(ST_Force2D(b.geom), pt.g) AS dist_m,
            ST_Contains(ST_Force2D(b.geom), pt.g) AS dedans
     FROM bdtopo_batiment b, pt
     ORDER BY ST_Force2D(b.geom) <-> pt.g
     LIMIT 1;`,
    [point.lon, point.lat],
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
    };
  }

  const { id, cleabs, alt_sol_bdtopo, alt_terrain_mnt, dist_m, dedans } = res.rows[0];

  const dansBatiment = dedans;
  const distanceAuBatimentM = dedans ? 0 : dist_m;
  const valide = dedans || dist_m <= ORIGIN_OUTSIDE_TOLERANCE_M;

  let raison: string;
  if (dedans) {
    raison = "Point à l'intérieur du bâtiment.";
  } else if (dist_m <= ORIGIN_OUTSIDE_TOLERANCE_M) {
    raison = `Point à ${dist_m.toFixed(2)} m du bâtiment (toléré).`;
  } else {
    raison = `Point à ${dist_m.toFixed(2)} m du bâtiment le plus proche : hors tolérance de 0,30 m. Repositionne le marqueur sur le bâtiment.`;
  }

  return {
    valide,
    raison,
    batimentOrigine: valide ? { id, cleabs } : null,
    // terrain lu sur le MNT (LiDAR) au point exact = même cellule 50 cm que le MNS ;
    // null si hors couverture MNT ou nodata -9999 → pas de certificat (garde pipeline l.61-63).
    altitudeTerrainOrigineM: valide ? alt_terrain_mnt : null,
    altSolBdTopoM: alt_sol_bdtopo, // INFORMATIF uniquement (comparaison en test)
    distanceAuBatimentM,
    dansBatiment,
  };
}
