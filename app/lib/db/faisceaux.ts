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
import { obstaclesSurAxe, natureTraverseeParFaisceau } from "./obstacles";
import { ANALYSIS_RANGE_M } from "../svv/config";
import { query } from "./client";

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
      impactAncien: obstacle?.ancien ?? false, // F2 : dégagé/inconnu → false (jamais supposé ancien)
    });
  }

  // F4 — longueur de nature traversée, en UN seul round-trip pour les 61 faisceaux (Option B).
  // Corridor OUVERT borné au 1er obstacle : min(distanceObstacleM, portée) ; null → portée.
  // N'altère NI distanceObstacleM NI le calcul du Résultat A.
  const bornes = resultats.map((r) =>
    Math.min(r.distanceObstacleM ?? ANALYSIS_RANGE_M, ANALYSIS_RANGE_M),
  );
  const naturesM = await natureTraverseeParFaisceau(params.point, azimuts, bornes);
  resultats.forEach((r, i) => {
    r.natureTraverseeM = naturesM[i];
  });

  // Étape 2 — enrichissement familial du 1er obstacle (LECTURE SEULE, un seul round-trip).
  // Pour chaque cleabs heurté : année (bdnb), présence MH (monuments_historiques),
  // présence Inventaire (inventaire_general, badge actif). N'altère NI distanceObstacleM NI le verdict.
  await enrichirFamilles(resultats);

  return resultats;
}

interface LigneFamille {
  cleabs: string;
  annee: number | string | null;
  is_mh: boolean;
  is_inv: boolean;
}

/**
 * Enrichit `impactAnnee` / `impactMH` / `impactInventaire` de chaque faisceau à partir de son
 * `impactCleabs`, en UN seul SELECT (LECTURE SEULE). `impactEmblematique` reste false (table à venir).
 * Aucune écriture ; ne touche PAS monuments_historiques ni inventaire_general (jointures seules).
 */
async function enrichirFamilles(resultats: FaisceauResultat[]): Promise<void> {
  const cleabs = [...new Set(resultats.map((r) => r.impactCleabs).filter((c): c is string => !!c))];
  resultats.forEach((r) => {
    r.impactEmblematique = false; // Patrimoine mondial : table absente → jamais aujourd'hui.
  });
  if (cleabs.length === 0) return;

  const res = await query<LigneFamille>(
    `SELECT t.cleabs,
            (SELECT annee_construction FROM bdnb_annee_batiment WHERE cleabs = t.cleabs LIMIT 1) AS annee,
            EXISTS (SELECT 1 FROM monuments_historiques WHERE cleabs = t.cleabs)                 AS is_mh,
            EXISTS (SELECT 1 FROM inventaire_general    WHERE cleabs = t.cleabs AND badge_actif)  AS is_inv
     FROM unnest($1::text[]) AS t(cleabs)`,
    [cleabs],
  );
  const parCleabs = new Map<string, LigneFamille>(res.rows.map((row) => [row.cleabs, row]));
  resultats.forEach((r) => {
    if (!r.impactCleabs) return;
    const info = parCleabs.get(r.impactCleabs);
    if (!info) return;
    r.impactAnnee = info.annee == null ? null : Number(info.annee);
    r.impactMH = info.is_mh;
    r.impactInventaire = info.is_inv;
  });
}
