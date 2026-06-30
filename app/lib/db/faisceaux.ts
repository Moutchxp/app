/**
 * Les 61 faisceaux d'amplitude (Mode B) → FaisceauResultat[].
 *
 * Pour un point d'origine validé + un azimut principal + l'altitude de la
 * fenêtre, calcule les 61 faisceaux (3° sur ±90°) et produit le tableau que
 * scoreDegagement (Bloc A) consommera.
 *
 * Réutilise intégralement la logique de Bloc A : genererFaisceauxAmplitude
 * (geo), obstaclesSurAxe (db/obstacles) et premierObstacle (svv/verdict).
 * Aucune logique de calcul n'est réécrite ici.
 */
import type { PointWgs84 } from "../svv/geo";
import { genererFaisceauxAmplitude } from "../svv/geo";
import { premierObstacle } from "../svv/verdict";
import type { FaisceauResultat } from "../svv/scoreDegagement";
import { obstaclesSurAxe } from "./obstacles";

export interface ParametresFaisceaux {
  point: PointWgs84;
  azimutPrincipalDeg: number;
  batimentOrigineId: number;
  /** Emprise L93 (WKT, SRID 2154) du bâtiment d'origine. Transport pur : non consommé ici. */
  batimentOriginePolygoneWkt?: string;
  altitudeFenetreM: number;
}

/** Offset signé d'un azimut par rapport à l'axe principal, dans [-90, +90]. */
function offsetSigne(azimut: number, azimutPrincipalDeg: number): number {
  return ((azimut - azimutPrincipalDeg + 540) % 360) - 180;
}

export async function faisceauxAmplitude(
  params: ParametresFaisceaux,
): Promise<FaisceauResultat[]> {
  const azimuts = genererFaisceauxAmplitude(params.azimutPrincipalDeg);

  const resultats: FaisceauResultat[] = [];
  for (const azimut of azimuts) {
    const candidats = await obstaclesSurAxe({
      point: params.point,
      azimutDeg: azimut,
      batimentOrigineId: params.batimentOrigineId,
      batimentOriginePolygoneWkt: params.batimentOriginePolygoneWkt,
    });
    const res = premierObstacle(candidats, params.altitudeFenetreM);
    const obstacle = res.obstacle; // 1er obstacle retenu (≥ fenêtre) ou null si dégagé
    resultats.push({
      offsetDeg: offsetSigne(azimut, params.azimutPrincipalDeg),
      distanceObstacleM: res.distanceM, // null si dégagé / non tranchable — INCHANGÉ (calcul de A)
      // Enrichissement Couche 1 B : métadonnées du 1er obstacle (nullables) ; n'affectent pas A.
      rayonWkt: obstacle?.rayonWkt,
      impactCleabs: obstacle?.cleabs ?? null,
      impactNature: obstacle?.nature ?? null,
      impactPointWkt: obstacle?.impactPointWkt ?? null,
    });
  }
  return resultats;
}
