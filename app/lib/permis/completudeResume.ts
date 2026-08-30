/**
 * PERF-1 — BILAN LÉGER de complétude pour la LIGNE DE TITRE (visible sans déplier). PUR : dérivé du diagnostic déjà MÉMORISÉ
 * (aucune relecture de PDF, aucune IA). Trois états seulement, l'information portée par le TEXTE (jamais la couleur seule) :
 *   - `incomplet` (+ nombre de familles manquantes) ;
 *   - `complet` ;
 *   - `jamais` : diagnostic jamais calculé → mention neutre, JAMAIS « incomplet » (on ne sait pas).
 */
export type StatutCompletude = 'complet' | 'incomplet' | 'jamais';
export interface ResumeCompletude { statut: StatutCompletude; manquantes: number }

/** Forme minimale lue : les lignes du diagnostic (présent/manquant par famille). `null` = jamais analysé. */
export interface DiagnosticLu { diagnostic: { lignes: { presente: boolean }[] } }

export function resumeCompletude(completude: DiagnosticLu | null): ResumeCompletude {
  if (completude === null) return { statut: 'jamais', manquantes: 0 }; // jamais calculé → neutre (surtout pas « incomplet »)
  const manquantes = completude.diagnostic.lignes.filter((l) => !l.presente).length;
  return { statut: manquantes > 0 ? 'incomplet' : 'complet', manquantes };
}
