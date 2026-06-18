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
  altitudeTerrainOrigineM: number | null; // = altitude_minimale_sol du bâtiment d'origine (Mode B)
  distanceAuBatimentM: number; // 0 si à l'intérieur, sinon distance au bâtiment le plus proche
  dansBatiment: boolean; // true si strictement à l'intérieur d'une emprise
}

interface LigneBatiment {
  id: number;
  cleabs: string;
  alt_sol: number | null;
  dist_m: number;
  dedans: boolean;
}

export async function validerOrigine(point: PointWgs84): Promise<ValidationOrigine> {
  const res = await query<LigneBatiment>(
    `WITH pt AS (
       SELECT ST_Transform(ST_SetSRID(ST_MakePoint($1, $2), 4326), 2154) AS g
     )
     SELECT b.id, b.cleabs, b.altitude_minimale_sol AS alt_sol,
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
      distanceAuBatimentM: Infinity,
      dansBatiment: false,
    };
  }

  const { id, cleabs, alt_sol, dist_m, dedans } = res.rows[0];

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
    altitudeTerrainOrigineM: valide ? alt_sol : null, // alt_sol peut être null en base → garder null
    distanceAuBatimentM,
    dansBatiment,
  };
}
