/**
 * PERF-1 — état du bouton « Valider la projection » selon que le bloc BÂTIMENTS est déplié ou non. PUR.
 *
 * Le verdict (peut-on valider ?) est calculé par le bloc bâtiments (`BlocTraceEmprise`), qui n'est MONTÉ qu'au dépliage (PERF-1).
 * Tant que ce bloc n'a jamais été ouvert, il n'y a pas de verdict — on ne dit donc PAS « chargement… » indéfiniment : on invite à
 * déplier. Une fois ouvert, comportement identique à avant (le verdict pilote le bouton). Ce helper ne change AUCUN calcul de verdict.
 */
import type { VerdictProjection } from './projectionBatiments';

export interface EtatValidation { peutValider: boolean; aucunBatiment: boolean; libelle: string }

export const INVITE_DEPLIER_BATIMENTS = 'Dépliez « Bâtiments et projection » pour projeter et valider.';

export function etatValidationProjection(batimentsOuvert: boolean, verdict: VerdictProjection | null): EtatValidation {
  if (!batimentsOuvert) return { peutValider: false, aucunBatiment: false, libelle: INVITE_DEPLIER_BATIMENTS };
  return {
    peutValider: verdict?.peutValider ?? false,
    aucunBatiment: verdict?.aucunBatiment ?? false,
    libelle: verdict?.libelle ?? 'chargement des bâtiments…',
  };
}
