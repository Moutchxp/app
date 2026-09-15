/**
 * PERF-1 — BILAN LÉGER de complétude pour la LIGNE DE TITRE (visible sans déplier). PUR : dérivé du diagnostic déjà MÉMORISÉ
 * (aucune relecture de PDF, aucune IA). Trois états seulement, l'information portée par le TEXTE (jamais la couleur seule) :
 *   - `incomplet` (+ nombre de familles manquantes) ;
 *   - `complet` ;
 *   - `jamais` : diagnostic jamais calculé → mention neutre, JAMAIS « incomplet » (on ne sait pas).
 */
export type StatutCompletude = 'complet' | 'incomplet' | 'jamais';
export interface ResumeCompletude { statut: StatutCompletude; manquantes: number }

/** Forme minimale lue : l'ÉTAT de chaque famille du diagnostic. `null` = jamais analysé. Une famille `indetermine` (« à vérifier »)
 *  n'est NI présente NI manquante → elle ne compte pas comme manquante et ne rend pas, à elle seule, un dossier « incomplet ». */
export interface DiagnosticLu { diagnostic: { lignes: { etat: 'present' | 'manquant' | 'indetermine' }[] } }

export function resumeCompletude(completude: DiagnosticLu | null): ResumeCompletude {
  if (completude === null) return { statut: 'jamais', manquantes: 0 }; // jamais calculé → neutre (surtout pas « incomplet »)
  const manquantes = completude.diagnostic.lignes.filter((l) => l.etat === 'manquant').length; // `indetermine` exclu (jamais un faux manquant)
  return { statut: manquantes > 0 ? 'incomplet' : 'complet', manquantes };
}

/**
 * LOT 13-A — FORMULATION UNIQUE du bilan « incomplet » (« dossier incomplet (N famille(s) manquante(s)) »), portée à la fois par la
 * ligne de titre du bloc autonome (BlocCompletude, « Analyse et projection ») ET par le TITRE de la famille « Complétude des pièces »
 * de l'encart (En cours) — même mot, une seule source, aucune divergence possible. PUR. N'appelez qu'avec `manquantes ≥ 1` (le zéro
 * ne s'affiche jamais, cf. `resumeCompletude`).
 */
export function libelleFamillesManquantes(manquantes: number): string {
  const s = manquantes > 1 ? 's' : '';
  return `dossier incomplet (${manquantes} famille${s} manquante${s})`;
}

/**
 * PERF-2 — faut-il relancer AUTOMATIQUEMENT le diagnostic ? OUI si un diagnostic EXISTE et qu'il est PÉRIMÉ (la GED a changé depuis),
 * et SEULEMENT si on ne l'a pas DÉJÀ lancé pour cette ouverture de fiche (`dejaLance`). Cette garde vaut ANTI-BOUCLE : `dejaLance`
 * reste vrai même si le recalcul échoue ou si la péremption persiste → jamais de relance en boucle. Jamais analysé (`null`) → NON
 * (on n'invente pas un premier calcul en tâche de fond ; la mention reste neutre).
 */
export function doitRecalculerAuto(completude: { perime: boolean } | null, dejaLance: boolean): boolean {
  return !dejaLance && completude !== null && completude.perime === true;
}
