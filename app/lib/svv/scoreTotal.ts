/**
 * Score de qualité de vue — agrégation /100 + libellés d'affichage.
 *
 * LOGIQUE PURE, totalement INDÉPENDANTE du verdict binaire (aucun couplage) :
 * le score n'influence jamais le label, et le label n'entre jamais ici.
 *
 * Consomme les sorties des moteurs Famille 1 et Famille 2 ; ne recalcule rien.
 *
 * Réf autoritative : SPEC_score_qualite_vue.md (note & affichage). Constantes
 * issues de config.ts — rien en dur. Aucun arrondi.
 */
import {
  SCORE_LABEL_EXCEPTIONNELLE_MIN,
  SCORE_LABEL_EXCELLENTE_MIN,
} from './config';
import type { ScoreFamille1, FaisceauResultat } from './scoreDegagement';
import type { ScorePaysage } from './entreePaysage';
import { noteDegagement } from './coucheDegagement';
import { PROFIL_DEGAGEMENT_DEFAUT } from './profilDegagement';

/** Clé de libellé ; le texte affiché est une préoccupation de la couche UI. */
export type LibelleScore = 'EXCEPTIONNELLE' | 'EXCELLENTE' | null;

export interface ScoreTotal {
  total: number; // /100, sans arrondi
  libelle: LibelleScore;
  scorePartiel: boolean;
  famille1: ScoreFamille1;
  famille2: ScorePaysage;
}

export function scoreTotal(
  famille1: ScoreFamille1,
  famille2: ScorePaysage,
  faisceaux: FaisceauResultat[],
  azimutDeg?: number,
): ScoreTotal {
  // Résultat B / Couche 1 — note de dégagement /80 (distances PERÇUES boostées par famille).
  // Les 20 du haut de l'échelle /100 sont réservés à la Couche 2 (Exception), NON implémentée →
  // NON ajoutés (aucun scaling artificiel). `famille1` (Résultat A factuel) et `famille2` (paysage,
  // future Couche 2) restent CALCULÉS et conservés pour audit, mais N'ALIMENTENT PLUS le total.
  // Le VERDICT est calculé en amont (analyser) et n'entre jamais ici.
  const total = noteDegagement(faisceaux, PROFIL_DEGAGEMENT_DEFAUT, azimutDeg); // déjà clampé [0, plafondCouche1]
  const scorePartiel = famille2.scorePartiel;

  let libelle: LibelleScore = null;
  if (!scorePartiel) {
    // Un score partiel (photo insuffisante) ne décerne aucun libellé de qualité.
    if (total >= SCORE_LABEL_EXCEPTIONNELLE_MIN) {
      libelle = 'EXCEPTIONNELLE';
    } else if (total >= SCORE_LABEL_EXCELLENTE_MIN) {
      libelle = 'EXCELLENTE';
    }
  }

  return { total, libelle, scorePartiel, famille1, famille2 };
}
