/**
 * Score de qualité de vue — Famille 2 « Qualité du paysage » (50 pts).
 *
 * LOGIQUE PURE : aucune IA, aucune photo lue ici. Le moteur consomme des
 * enums/flags DÉJÀ résolus (par l'IA et/ou les données BD TOPO/OSM en amont) et
 * les mappe vers des points de façon 100 % déterministe et auditable.
 *
 * Réf autoritative : SPEC_score_qualite_vue.md (Famille 2). Toutes les
 * constantes (tables de points, malus) proviennent de config.ts — jamais de
 * valeur en dur ici. Aucun arrondi.
 */
import {
  TYPE_PAYSAGE_PTS,
  REMARQUABLES_MAX_PTS,
  MONUMENT_PTS,
  FACADES_HISTORIQUES_PTS,
  PROPRETE_BASE_PTS,
  PROPRETE_MALUS,
  type TypePaysage,
} from './config';
import {
  STRATE1_MAX_PTS,
  STRATE1_MIN_FAISCEAUX,
  STRATE2_MAX_PTS,
  MONUMENT_CRITERE_A_PTS,
  MONUMENT_DIST_EIFFEL,
  MONUMENT_DIST_SACRE_COEUR,
  MONUMENT_DIST_AUTRES,
  PROPRETE_MALUS_CAP,
  PROPRETE_MAJEURE_PTS,
  PROPRETE_MINEURE_PTS,
} from './config';
import type { EntreePaysage, MonumentCandidatFusionne, ScorePaysage } from './entreePaysage';

export type { TypePaysage };

export interface MonumentRemarquable {
  zone: 'central' | 'extremite';
  visiblePlusDeMoitie: boolean;
  ligneDeVueDegagee: boolean;
}

export interface EntreeFamille2 {
  /** false = photo inutilisable → composantes photo-dépendantes neutralisées. */
  photoExploitable: boolean;
  typeDominant: TypePaysage | null; // photo-dépendant
  monument: MonumentRemarquable | null; // photo/géo-dépendant
  facadesHistoriquesMajoritaires: boolean; // photo-dépendant
  // Propreté — malus photo :
  murAveugle: boolean;
  antennesParabolesPremierPlan: boolean;
  fouillis: boolean;
  // Propreté — malus data (toujours calculés) :
  batimentResidentielHautAxe: boolean; // ≥15 étages, axe ±20°, hors bureaux
  carrefourOuCimetiereCentral: boolean; // carrefour/cimetière, central ±45°
  // Propreté — malus hybride (photo-dépendant : paraboles) :
  batimentHautParabolesAxe: boolean; // >10 étages couvert de paraboles dans l'axe
}

export interface ScoreFamille2 {
  total: number; // /50
  typeDominant: number; // /25
  remarquables: number; // /15
  proprete: number; // /10
  scorePartiel: boolean;
  detail: {
    typeEnum: TypePaysage | null;
    remarquablesSource: 'monument' | 'facades' | 'aucun';
    malusPropreteApplique: number;
  };
}

const clamp = (v: number, min: number, max: number): number =>
  Math.min(Math.max(v, min), max);

export function scoreFamille2(entree: EntreeFamille2): ScoreFamille2 {
  const photo = entree.photoExploitable;

  // 1) Type dominant — 25 pts (photo-dépendant).
  const typeDominant =
    photo && entree.typeDominant !== null ? TYPE_PAYSAGE_PTS[entree.typeDominant] : 0;

  // 2) Remarquables — 15 pts, NON cumulatif (max des deux options).
  let ptsMonument = 0;
  if (photo && entree.monument !== null && entree.monument.ligneDeVueDegagee) {
    const grille = MONUMENT_PTS[entree.monument.zone];
    ptsMonument = entree.monument.visiblePlusDeMoitie ? grille.demiOuPlus : grille.moins;
  }
  const ptsFacades = photo && entree.facadesHistoriquesMajoritaires ? FACADES_HISTORIQUES_PTS : 0;

  let remarquablesSource: 'monument' | 'facades' | 'aucun' = 'aucun';
  if (ptsMonument > 0 || ptsFacades > 0) {
    remarquablesSource = ptsMonument >= ptsFacades ? 'monument' : 'facades';
  }
  const remarquables = clamp(Math.max(ptsMonument, ptsFacades), 0, REMARQUABLES_MAX_PTS);

  // 3) Propreté — 10 pts (départ 10, plancher 0).
  let malus = 0;
  if (photo) {
    if (entree.murAveugle) malus += PROPRETE_MALUS.murAveugle;
    if (entree.antennesParabolesPremierPlan) malus += PROPRETE_MALUS.antennesParaboles;
    if (entree.fouillis) malus += PROPRETE_MALUS.fouillis;
    if (entree.batimentHautParabolesAxe) malus += PROPRETE_MALUS.batimentHautParabolesAxe;
  }
  // Malus data : toujours appliqués (indépendants de la photo).
  if (entree.batimentResidentielHautAxe) malus += PROPRETE_MALUS.batimentResidentielHautAxe;
  if (entree.carrefourOuCimetiereCentral) malus += PROPRETE_MALUS.carrefourOuCimetiereCentral;

  const proprete = clamp(PROPRETE_BASE_PTS - malus, 0, PROPRETE_BASE_PTS);

  return {
    total: typeDominant + remarquables + proprete,
    typeDominant,
    remarquables,
    proprete,
    scorePartiel: !photo,
    detail: {
      typeEnum: entree.typeDominant,
      remarquablesSource,
      malusPropreteApplique: malus,
    },
  };
}

/**
 * Strate 1 — couverture valorisante (40 pts).
 * Prorata des faisceaux du cône central touchant au moins un élément valorisant.
 * Garde-fou : moins de STRATE1_MIN_FAISCEAUX faisceaux valorisants → 0.
 */
export function calculerStrate1(entree: EntreePaysage): number {
  const { faisceauxValorisants, faisceauxConeTotal } = entree;
  if (faisceauxConeTotal <= 0) return 0;
  if (faisceauxValorisants < STRATE1_MIN_FAISCEAUX) return 0;
  return (faisceauxValorisants / faisceauxConeTotal) * STRATE1_MAX_PTS;
}

/**
 * Courbe de distance générique d'un monument (critère B).
 * Pleine valeur (pleinPts) si distance < pleinM, décroissance linéaire jusqu'à 0 à zeroM.
 */
function pointsDistanceMonument(
  distanceM: number,
  courbe: { pleinM: number; zeroM: number; pleinPts: number },
): number {
  if (distanceM <= courbe.pleinM) return courbe.pleinPts;
  if (distanceM >= courbe.zeroM) return 0;
  const pente = courbe.pleinPts / (courbe.zeroM - courbe.pleinM);
  return courbe.pleinPts - (distanceM - courbe.pleinM) * pente;
}

/** Sélectionne les paramètres de courbe selon le type. */
function courbeParType(courbe: MonumentCandidatFusionne['courbe']) {
  if (courbe === 'EIFFEL') return MONUMENT_DIST_EIFFEL;
  if (courbe === 'SACRE_COEUR') return MONUMENT_DIST_SACRE_COEUR;
  return MONUMENT_DIST_AUTRES;
}

/**
 * Strate 2 — monuments de renommée mondiale (10 pts).
 * Par monument candidat : critère A (visibilité IA, 5 pts) + critère B (distance, 5 pts).
 * Somme de tous les monuments, plafonnée à STRATE2_MAX_PTS.
 * Retourne aussi le détail par monument (points = A + B).
 */
export function calculerStrate2(
  monuments: MonumentCandidatFusionne[],
): { total: number; detail: { id: MonumentCandidatFusionne['id']; points: number }[] } {
  const detail = monuments.map((m) => {
    const a = MONUMENT_CRITERE_A_PTS[m.fractionVisible];
    const b = pointsDistanceMonument(m.distanceM, courbeParType(m.courbe));
    return { id: m.id, points: a + b };
  });
  const somme = detail.reduce((acc, d) => acc + d.points, 0);
  const total = Math.min(somme, STRATE2_MAX_PTS);
  return { total, detail };
}

/**
 * Propreté — malus (plafond PROPRETE_MALUS_CAP).
 * Nuisances IA : majeures −PROPRETE_MAJEURE_PTS, mineures −PROPRETE_MINEURE_PTS.
 * Nuisances géométriques (carrefour, cimetière) comptées comme majeures ; débranchées
 * tant que les couches ne sont pas importées (l'entrée les laisse à false → contribuent 0).
 * Retourne la valeur du malus (positive, ≤ plafond).
 */
export function calculerMalusProprete(entree: EntreePaysage): number {
  const majeuresGeo = (entree.carrefourMajeur ? 1 : 0) + (entree.cimetiere ? 1 : 0);
  const nbMajeures = entree.nuisancesMajeures.length + majeuresGeo;
  const nbMineures = entree.nuisancesMineures.length;
  const brut = nbMajeures * PROPRETE_MAJEURE_PTS + nbMineures * PROPRETE_MINEURE_PTS;
  return Math.min(brut, PROPRETE_MALUS_CAP);
}

/**
 * Score Famille 2 complet — assemble les trois strates.
 * Strate 1 (toujours géométrique) + Strate 2 − malus, clampé [0, 50].
 * Si photo inexploitable : Strate 2 (critère A IA) et nuisances IA absentes → l'entrée
 * doit déjà refléter cet état (monuments vides, nuisances IA vides) ; scorePartiel = true.
 */
export function scorePaysage(entree: EntreePaysage): ScorePaysage {
  const strate1 = calculerStrate1(entree);
  const { total: strate2, detail: monumentsComptes } = calculerStrate2(entree.monuments);
  const malusProprete = calculerMalusProprete(entree);

  const total = clamp(strate1 + strate2 - malusProprete, 0, 50);

  return {
    total,
    strate1,
    strate2,
    malusProprete,
    scorePartiel: !entree.photoExploitable,
    detail: {
      faisceauxValorisants: entree.faisceauxValorisants,
      monumentsComptes,
      nuisancesMajeuresAppliquees: entree.nuisancesMajeures,
      nuisancesMineuresAppliquees: entree.nuisancesMineures,
      carrefourApplique: entree.carrefourMajeur,
      cimetiereApplique: entree.cimetiere,
    },
  };
}
