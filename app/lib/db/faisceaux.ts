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
  is_emblematique: boolean;
}

/**
 * Enrichit `impactAnnee` / `impactMH` / `impactInventaire` / `impactEmblematique` de chaque faisceau
 * à partir de son `impactCleabs`, en UN seul SELECT (LECTURE SEULE). Aucune écriture ; jointures seules.
 * Familles patrimoine lues depuis le modèle UNIFIÉ (`patrimoine_entite` + `patrimoine_entite_batiment`,
 * migration 009) ; année depuis `bdnb_annee_batiment`. Granularité de filtre PRÉSERVÉE : MH sans filtre ;
 * Inventaire filtre au niveau LIAISON (`peb.actif`) ; mondial filtre au niveau ENTITÉ (`pe.actif`).
 */
async function enrichirFamilles(resultats: FaisceauResultat[]): Promise<void> {
  const cleabs = [...new Set(resultats.map((r) => r.impactCleabs).filter((c): c is string => !!c))];
  resultats.forEach((r) => {
    r.impactEmblematique = false; // défaut : aucun bâti heurté, ou cleabs hors familles.
  });
  if (cleabs.length === 0) return;

  const res = await query<LigneFamille>(
    `SELECT t.cleabs,
            (SELECT annee_construction FROM bdnb_annee_batiment WHERE cleabs = t.cleabs LIMIT 1) AS annee,
            EXISTS (SELECT 1 FROM patrimoine_entite_batiment peb JOIN patrimoine_entite pe ON pe.id = peb.entite_id
                    WHERE peb.cleabs = t.cleabs AND pe.famille = 'mh')                            AS is_mh,
            EXISTS (SELECT 1 FROM patrimoine_entite_batiment peb JOIN patrimoine_entite pe ON pe.id = peb.entite_id
                    WHERE peb.cleabs = t.cleabs AND pe.famille = 'inventaire' AND peb.actif)       AS is_inv,
            EXISTS (SELECT 1 FROM patrimoine_entite_batiment peb JOIN patrimoine_entite pe ON pe.id = peb.entite_id
                    WHERE peb.cleabs = t.cleabs AND pe.famille = 'mondial' AND pe.actif = true)    AS is_emblematique
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
    r.impactEmblematique = info.is_emblematique;
  });
}
