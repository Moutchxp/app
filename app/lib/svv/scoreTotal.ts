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
  SCORE_TOTAL_MAX,
  SCORE_LABEL_EXCEPTIONNELLE_MIN,
  SCORE_LABEL_EXCELLENTE_MIN,
} from './config';
import type { ScoreFamille1 } from './scoreDegagement';
import type { ScoreFamille2 } from './scorePaysage';

/** Clé de libellé ; le texte affiché est une préoccupation de la couche UI. */
export type LibelleScore = 'EXCEPTIONNELLE' | 'EXCELLENTE' | null;

export interface ScoreTotal {
  total: number; // /100, sans arrondi
  libelle: LibelleScore;
  scorePartiel: boolean;
  famille1: ScoreFamille1;
  famille2: ScoreFamille2;
}

export function scoreTotal(famille1: ScoreFamille1, famille2: ScoreFamille2): ScoreTotal {
  const total = Math.min(famille1.total + famille2.total, SCORE_TOTAL_MAX);
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
