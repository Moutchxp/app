/**
 * Orchestrateur d'analyse (Mode B) — assemblage final.
 *
 * Enchaîne : validation du point d'origine → obstacles de l'axe → 61 faisceaux
 * → paysage (photo absente par défaut) → construit EntreeComplete → appelle
 * analyser() (Bloc A). Aucune logique de Bloc A n'est réécrite.
 */
import type { PointWgs84 } from "../svv/geo";
import { hauteurVision, type ModeOrigine } from "../svv/config";
import { analyser, type EntreeComplete, type ResultatComplet } from "../svv/analyse";
import type { EntreeFamille2 } from "../svv/scorePaysage";
import type { EntreePaysage } from "../svv/entreePaysage";
import { validerOrigine, type ValidationOrigine } from "./origine";
import { obstaclesSurAxe } from "./obstacles";
import { faisceauxAmplitude } from "./faisceaux";
import { preparerPaysageGeometrique } from "../svv/preparateurPaysage";

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

/**
 * Entrée Famille 2 neutre, nouveau modèle.
 * Aucune photo, aucune géométrie de paysage encore branchée : tout à zéro/vide.
 * photoExploitable=false → scorePartiel. À enrichir plus tard avec la vraie
 * fusion géométrie + IA.
 */
export function paysageVideNouveau(): EntreePaysage {
  return {
    photoExploitable: false,
    faisceauxValorisants: 0,
    faisceauxConeTotal: 0,
    monuments: [],
    nuisancesMajeures: [],
    nuisancesMineures: [],
    carrefourMajeur: false,
    cimetiere: false,
  };
}

export interface ParametresAnalyse {
  point: PointWgs84;
  azimutPrincipalDeg: number;
  etage: number;
  dernierEtage: boolean;
  paysage?: EntreePaysage;
  mode?: ModeOrigine; // saisie de l'origine ; défaut semi_auto (snap façade) si absent
}

export interface ResultatAnalyse {
  validation: ValidationOrigine;
  resultat: ResultatComplet | null;
}

export async function analyserAdresse(params: ParametresAnalyse): Promise<ResultatAnalyse> {
  // a) Validation du point d'origine.
  const validation = await validerOrigine(params.point, params.mode ?? "semi_auto");
  if (
    !validation.valide ||
    validation.batimentOrigine === null ||
    validation.altitudeTerrainOrigineM === null ||
    validation.pointSnappeWgs84 === null ||
    validation.pointSnappeL93 === null
  ) {
    return { validation, resultat: null };
  }

  // b) Altitude de la fenêtre (helper Bloc A).
  const altitudeFenetreM = validation.altitudeTerrainOrigineM + hauteurVision(params.etage);

  // c) Obstacles sur l'axe principal (LiDAR prioritaire + point de contact).
  const obstaclesAxePrincipal = await obstaclesSurAxe({
    point: validation.pointSnappeWgs84,
    azimutDeg: params.azimutPrincipalDeg,
    batimentOrigineId: validation.batimentOrigine.id,
    batimentOriginePolygoneWkt: validation.batimentOrigine.polygoneWkt,
    lidar: true,
    altitudeFenetreM,
  });

  // d) 61 faisceaux d'amplitude.
  const faisceaux = await faisceauxAmplitude({
    point: validation.pointSnappeWgs84,
    azimutPrincipalDeg: params.azimutPrincipalDeg,
    batimentOrigineId: validation.batimentOrigine.id,
    batimentOriginePolygoneWkt: validation.batimentOrigine.polygoneWkt,
    altitudeFenetreM,
  });

  // e) Paysage (pièce D) : moitié GÉOMÉTRIQUE réelle (Strate 1 + monuments candidats) via le
  // préparateur. PAS d'IA ici (photoExploitable=false, monuments laissés vides → Strate 2=0).
  // Fallback propre sur le stub si le préparateur échoue (pas de crash).
  let paysage: EntreePaysage;
  if (params.paysage) {
    paysage = params.paysage;
  } else {
    try {
      const geo = await preparerPaysageGeometrique(validation.pointSnappeL93, params.azimutPrincipalDeg);
      paysage = {
        photoExploitable: false, // pas d'IA câblée (pièce B/C) → scorePartiel reste true
        faisceauxValorisants: geo.faisceauxValorisants,
        faisceauxConeTotal: geo.faisceauxConeTotal,
        monuments: [], // Strate 2 nécessite l'IA (fractionVisible) → vide pour l'instant
        nuisancesMajeures: [],
        nuisancesMineures: [],
        carrefourMajeur: false,
        cimetiere: false,
      };
    } catch (e) {
      console.warn("[pipeline] préparateur paysage échoué — fallback stub", e);
      paysage = paysageVideNouveau();
    }
  }

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
