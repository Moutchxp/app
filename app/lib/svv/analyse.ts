/**
 * Orchestrateur Bloc A — point d'entrée unique de l'analyse Sans Vis-à-Vis®.
 *
 * PURE ORCHESTRATION : aucune donnée IGN, aucune IA, aucune constante métier.
 * Ne fait qu'appeler les moteurs déjà écrits et router des entrées DÉJÀ résolues.
 *
 * DÉCOUPLAGE STRICT (CLAUDE.md §2/§3) : le verdict ne dépend QUE de la géométrie ;
 * le score est calculé indépendamment et ne modifie JAMAIS le verdict (et
 * inversement). Aucun arrondi (§5).
 */
import { premierObstacle, type ObstacleCandidat, type ResultatVerdict } from './verdict';
import { scoreFamille1, type FaisceauResultat } from './scoreDegagement';
import { scorePaysage } from './scorePaysage';
import type { EntreePaysage } from './entreePaysage';
import { scoreTotal, type ScoreTotal } from './scoreTotal';
import {
  cartoucheDegagement,
  cartoucheVueNature,
  cartoucheImmobilier,
  cartoucheMonuments,
  type ExtractionVueNature,
  type ExtractionImmobilier,
  type ExtractionMonuments,
} from './coucheDegagement';
import { PROFIL_DEGAGEMENT_DEFAUT, type ProfilDegagement } from './profilDegagement';

export interface EntreeComplete {
  // Contexte d'observation.
  altitudeFenetreM: number;
  orientationAzimutDeg: number;
  dernierEtage: boolean;
  // Axe principal (verdict) : obstacles candidats déjà résolus (ordre indifférent).
  obstaclesAxePrincipal: ObstacleCandidat[];
  // 61 faisceaux (amplitude du score).
  faisceaux: FaisceauResultat[];
  // Extraction « vue nature » (DESCRIPTIVE, score-only) — optionnelle (absente dans les tests unitaires).
  extractionVueNature?: ExtractionVueNature;
  // Extraction « environnement immobilier » (DESCRIPTIVE, score-only) — optionnelle (absente en tests unit).
  extractionImmobilier?: ExtractionImmobilier;
  // Extraction « monuments historiques » (DESCRIPTIVE, score-only) — optionnelle (absente en tests unit).
  extractionMonuments?: ExtractionMonuments;
  // Paysage (Famille 2) : enums/flags déjà résolus.
  paysage: EntreePaysage;
}

export interface ResultatComplet {
  verdict: ResultatVerdict; // sortie de premierObstacle
  score: ScoreTotal; // sortie de scoreTotal
  distanceAxePrincipalM: number | null; // distance retenue pour le sous-score distance
  contexteDegagement: string; // cartouche de contexte DESCRIPTIVE (SCORE-ONLY : n'entre ni dans score ni verdict)
  contexteVueNature: string | null; // cartouche « vue nature » DESCRIPTIVE (SCORE-ONLY) ; null si non déclenchée
  contexteImmobilier: string | null; // cartouche « environnement immobilier » DESCRIPTIVE (SCORE-ONLY) ; null si non déclenchée
  monumentsHistoriques: string[]; // badges « monument historique » (variante A) DESCRIPTIFS (SCORE-ONLY) ; [] si aucun
}

/**
 * Distance du PREMIER OBSTACLE RÉEL CONFIRMÉ sur l'axe (sommet connu ≥ fenêtre),
 * pour le sous-score distance de la Famille 1.
 *
 * Choix documenté : un bâtiment de hauteur inconnue (source NONE) n'est PAS
 * compté comme obstacle pour ce sous-score — l'incertitude est déjà portée par
 * le verdict INDÉTERMINÉ. Tri sans muter l'entrée.
 */
function distancePremierObstacleConfirme(
  obstacles: ObstacleCandidat[],
  altitudeFenetreM: number,
): number | null {
  const confirme = [...obstacles]
    .sort((a, b) => a.distanceM - b.distanceM)
    .find((o) => o.altitudeSommetM !== null && o.altitudeSommetM >= altitudeFenetreM);
  return confirme ? confirme.distanceM : null;
}

export function analyser(
  entree: EntreeComplete,
  profil: ProfilDegagement = PROFIL_DEGAGEMENT_DEFAUT,
): ResultatComplet {
  // 1) Verdict géométrique pur.
  const verdict = premierObstacle(entree.obstaclesAxePrincipal, entree.altitudeFenetreM);

  // 2) Distance retenue pour le sous-score (obstacle confirmé uniquement).
  const distanceAxePrincipalM = distancePremierObstacleConfirme(
    entree.obstaclesAxePrincipal,
    entree.altitudeFenetreM,
  );

  // 3) Score Famille 1 (dégagement objectif).
  const f1 = scoreFamille1({
    distanceAxePrincipalM,
    faisceaux: entree.faisceaux,
    orientationAzimutDeg: entree.orientationAzimutDeg,
    dernierEtage: entree.dernierEtage,
  });

  // 4) Score Famille 2 (qualité du paysage).
  const f2 = scorePaysage(entree.paysage);

  // 5) Score affiché = Résultat B / Couche 1 (note de dégagement /80) sur les 61 faisceaux.
  //    Le verdict (calculé en 1) n'entre jamais ici ; Résultat A (f1) reste le constat factuel.
  const score = scoreTotal(f1, f2, entree.faisceaux, entree.orientationAzimutDeg, profil);

  // 6) Cartouche de contexte « dégagement » — DESCRIPTIVE, sur les 61 faisceaux (score-only) ;
  //    n'entre NI dans le score NI dans le verdict.
  const contexteDegagement = cartoucheDegagement(entree.faisceaux, profil);

  // 7) Cartouche « vue nature » — DESCRIPTIVE, score-only ; null si extraction absente (tests) ou non déclenchée.
  const contexteVueNature = entree.extractionVueNature
    ? cartoucheVueNature(entree.faisceaux, entree.extractionVueNature)
    : null;

  // 8) Cartouche « environnement immobilier » — DESCRIPTIVE, score-only ; null si extraction absente ou non déclenchée.
  const ei = entree.extractionImmobilier;
  const contexteImmobilier = ei ? cartoucheImmobilier(ei.nCone, ei.faisceaux) : null;

  // 9) Badges « monument historique » (variante A) — DESCRIPTIFS, score-only ; [] si extraction absente ou aucun MH.
  const monumentsHistoriques = entree.extractionMonuments ? cartoucheMonuments(entree.extractionMonuments) : [];

  return { verdict, score, distanceAxePrincipalM, contexteDegagement, contexteVueNature, contexteImmobilier, monumentsHistoriques };
}
