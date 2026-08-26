/**
 * AUDIT (démolitions) — IDENTITÉ (cleabs) du bâtiment BD TOPO qui fonde l'obstacle du verdict.
 *
 * 🔴 STRICTEMENT ADDITIF & LECTURE SEULE : cette fonction n'entre NI dans le calcul du verdict, NI dans la distance, NI dans
 * l'altitude. Elle est appelée A POSTERIORI (après que `premierObstacle` a tranché), à partir de la distance RETENUE, pour
 * retrouver le bâtiment de l'axe à cette distance. Elle NE touche PAS la mécanique d'échantillonnage (obstaclesParBalayage /
 * echantillonnerGrille), NI le seuil de 40 m, NI la préséance des altitudes, NI le golden Asnières.
 *
 * Lit le bâti BD TOPO RÉEL (`bdtopo_batiment`, vue sur `batiment`) — JAMAIS l'emprise projetée reconstituée.
 *
 * BEST-EFFORT ABSOLU : renvoie `null` si aucun bâti n'est identifiable (obstacle sans emprise BD TOPO, trou de données) OU sur
 * toute erreur. Un champ d'audit ne bloque JAMAIS l'émission d'un certificat (même contrat que `resoudreVille`).
 *
 * Méthode & LIMITES (dites franchement) : on reconstruit le point de l'axe à la distance retenue (origine + dist·(sinθ, cosθ),
 * offset transverse 0) et on prend le bâtiment le plus proche dont l'emprise touche une boîte de ±CORRIDOR_HALF_WIDTH_M autour de
 * ce point (même prédicat indexé que le calage façade : `ST_Intersects(geom, boîte)`, Z ignoré). C'est le bâtiment de l'obstacle
 * dans le cas nominal (façade calée sur la distance) ; en cas d'aile opposée (U), c'est le bâtiment d'origine lui-même — capturé
 * tel quel, sans exclusion. Si l'obstacle réel était décalé au bord du couloir, la boîte le rattrape (rayon = demi-couloir).
 */
import { query } from './client';
import type { PointWgs84 } from '../svv/geo';
import { CORRIDOR_HALF_WIDTH_M } from '../svv/config';

/** cleabs du bâtiment qui fonde l'obstacle à `distanceM` sur l'axe, ou `null` (aucun / non identifiable / erreur). LECTURE SEULE. */
export async function cleabsObstacleAxe(axe: { point: PointWgs84; azimutDeg: number }, distanceM: number): Promise<string | null> {
  // Pas d'obstacle à distance exploitable (null, ≤ 0, sentinelle INDÉTERMINÉ 0) → absence explicite, aucune requête.
  if (!Number.isFinite(distanceM) || distanceM <= 0) return null;
  try {
    const { rows } = await query<{ cleabs: string | null }>(
      `WITH o AS (SELECT ST_Transform(ST_SetSRID(ST_MakePoint($1,$2),4326),2154) AS g),
            pt AS (SELECT ST_SetSRID(ST_MakePoint(
                     ST_X(o.g) + $3 * sin(radians($4)),
                     ST_Y(o.g) + $3 * cos(radians($4))), 2154) AS g FROM o),
            cell AS (SELECT ST_Expand(pt.g, $5) AS g FROM pt)   -- boîte ±demi-couloir autour du point d'obstacle
       SELECT b.cleabs
         FROM bdtopo_batiment b, cell, pt
        WHERE ST_Intersects(b.geom, cell.g)                     -- PRÉFILTRE indexé (batiment_geom_geom_idx) ; Z ignoré (prouvé)
        ORDER BY ST_Distance(ST_Force2D(b.geom), pt.g) ASC      -- le plus proche du point d'obstacle (candidats déjà ~1-2)
        LIMIT 1`,
      [axe.point.lon, axe.point.lat, distanceM, axe.azimutDeg, CORRIDOR_HALF_WIDTH_M],
    );
    return rows[0]?.cleabs ?? null;
  } catch {
    return null; // best-effort : un champ d'audit ne bloque jamais l'émission
  }
}
