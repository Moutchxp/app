/**
 * Orchestrateur d'analyse (Mode B) — assemblage final.
 *
 * Enchaîne : validation du point d'origine → obstacles de l'axe → 61 faisceaux
 * → paysage (photo absente par défaut) → construit EntreeComplete → appelle
 * analyser() (Bloc A). Aucune logique de Bloc A n'est réécrite.
 */
import type { PointWgs84 } from "../svv/geo";
import { hauteurVision } from "../svv/config";
import { analyser, type EntreeComplete, type ResultatComplet } from "../svv/analyse";
import type { EntreeFamille2 } from "../svv/scorePaysage";
import { validerOrigine, type ValidationOrigine } from "./origine";
import { obstaclesSurAxe } from "./obstacles";
import { faisceauxAmplitude } from "./faisceaux";

/**
 * EntreeFamille2 neutre représentant « aucune photo exploitable ».
 *
 * Valeurs choisies :
 *  - photoExploitable=false → scoreFamille2 neutralise les composantes
 *    photo-dépendantes (type=0, remarquables=0, malus photo ignorés) et pose
 *    scorePartiel=true.
 *  - typeDominant=null, monument=null : pas de paysage ni de monument détecté.
 *  - tous les flags de nuisance à false : aucune donnée nuisance connue ici →
 *    on ne pénalise pas dans le doute (les malus data restent à 0, propreté=10).
 *    Les nuisances « data » réelles (résidentiel haut, carrefour/cimetière)
 *    pourront être branchées plus tard via le paramètre `paysage`.
 */
export function paysageSansPhoto(): EntreeFamille2 {
  return {
    photoExploitable: false,
    typeDominant: null,
    monument: null,
    facadesHistoriquesMajoritaires: false,
    murAveugle: false,
    antennesParabolesPremierPlan: false,
    fouillis: false,
    batimentResidentielHautAxe: false,
    carrefourOuCimetiereCentral: false,
    batimentHautParabolesAxe: false,
  };
}

export interface ParametresAnalyse {
  point: PointWgs84;
  azimutPrincipalDeg: number;
  etage: number;
  dernierEtage: boolean;
  paysage?: EntreeFamille2;
}

export interface ResultatAnalyse {
  validation: ValidationOrigine;
  resultat: ResultatComplet | null;
}

export async function analyserAdresse(params: ParametresAnalyse): Promise<ResultatAnalyse> {
  // a) Validation du point d'origine.
  const validation = await validerOrigine(params.point);
  if (
    !validation.valide ||
    validation.batimentOrigine === null ||
    validation.altitudeTerrainOrigineM === null
  ) {
    return { validation, resultat: null };
  }

  // b) Altitude de la fenêtre (helper Bloc A).
  const altitudeFenetreM = validation.altitudeTerrainOrigineM + hauteurVision(params.etage);

  // c) Obstacles sur l'axe principal (LiDAR prioritaire + point de contact).
  const obstaclesAxePrincipal = await obstaclesSurAxe({
    point: params.point,
    azimutDeg: params.azimutPrincipalDeg,
    batimentOrigineId: validation.batimentOrigine.id,
    batimentOriginePolygoneWkt: validation.batimentOrigine.polygoneWkt,
    lidar: true,
    altitudeFenetreM,
  });

  // d) 61 faisceaux d'amplitude.
  const faisceaux = await faisceauxAmplitude({
    point: params.point,
    azimutPrincipalDeg: params.azimutPrincipalDeg,
    batimentOrigineId: validation.batimentOrigine.id,
    batimentOriginePolygoneWkt: validation.batimentOrigine.polygoneWkt,
    altitudeFenetreM,
  });

  // e) Paysage (fourni, sinon « sans photo »).
  const paysage = params.paysage ?? paysageSansPhoto();

  // f) Assemblage de l'entrée complète.
  const entree: EntreeComplete = {
    altitudeFenetreM,
    orientationAzimutDeg: params.azimutPrincipalDeg,
    dernierEtage: params.dernierEtage,
    obstaclesAxePrincipal,
    faisceaux,
    paysage,
  };

  // g) Analyse (Bloc A).
  const resultat = analyser(entree);

  return { validation, resultat };
}
