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
import { obstaclesSurAxe, resoudreVueNature, resoudreEpoqueImmobilier, resoudreMonuments } from "./obstacles";
import { faisceauxAmplitude } from "./faisceaux";
import { preparerPaysageGeometrique } from "../svv/preparateurPaysage";
import { ANALYSIS_RANGE_M, CONE_VUE_NATURE_DEG } from "../svv/config";

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
  hauteurSousPlafondM?: number; // hauteur sous plafond saisie par l'utilisateur (m) ; si absent, hauteurVision applique 2,50
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
  const altitudeFenetreM = validation.altitudeTerrainOrigineM + hauteurVision(params.etage, params.hauteurSousPlafondM);

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

  // d-bis) Cartouche « vue nature » (DESCRIPTIVE, SCORE-ONLY) : extraction PARALLÈLE sur le cône visible
  //        (|offset| ≤ CONE_VUE_NATURE_DEG), même borne que natureTraverseeM (min(distObst, portée)).
  const coneFaisc = faisceaux.filter((f) => Math.abs(f.offsetDeg) <= CONE_VUE_NATURE_DEG);
  const coneAzimuts = coneFaisc.map((f) => (((params.azimutPrincipalDeg + f.offsetDeg) % 360) + 360) % 360);
  const coneBornes = coneFaisc.map((f) => Math.min(f.distanceObstacleM ?? ANALYSIS_RANGE_M, ANALYSIS_RANGE_M));
  const extractionVueNature = await resoudreVueNature(validation.pointSnappeWgs84, coneAzimuts, coneBornes);

  // d-ter) Cartouche « environnement immobilier » (DESCRIPTIVE, SCORE-ONLY) — MÊME cône (±60°). Rayon NU
  //        jusqu'à 200 m, 1er bâtiment traversé PAR FAISCEAU (la borne bâti est calculée DANS la requête,
  //        PAS coneBornes/distanceObstacleM — cf. bug troncature). coneBornes reste pour resoudreVueNature.
  const extractionImmobilier = await resoudreEpoqueImmobilier(validation.pointSnappeWgs84, coneAzimuts);

  // d-quater) Badges « monument historique » (DESCRIPTIF, SCORE-ONLY) — les 61 azimuts COMPLETS (pas le
  //           cône) : offsetDeg signé conservé pour filtrer le cône côté badge + futur boost.
  const azimutsComplets = faisceaux.map((f) => (((params.azimutPrincipalDeg + f.offsetDeg) % 360) + 360) % 360);
  const extractionMonuments = await resoudreMonuments(validation.pointSnappeWgs84, azimutsComplets, params.azimutPrincipalDeg);

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
    extractionVueNature,
    extractionImmobilier,
    extractionMonuments,
    paysage,
  };

  // g) Analyse (Bloc A).
  const resultat = analyser(entree);

  return { validation, resultat };
}
