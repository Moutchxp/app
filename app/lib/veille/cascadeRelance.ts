/**
 * Lot 3/6 — CASCADE de relance : cœur PUR de l'ordonnancement (aucune I/O). Deux responsabilités seulement :
 *  - `etapeCible` : quelle étape (rappel/avis/saisine) est due AUJOURD'HUI pour une demande, d'après le nombre de jours restants
 *    avant l'échéance et les 2 seuils configurés — ou `null` (trop tôt). INDÉPENDANTE d'`etatEcheance` (qui ne garde que la
 *    QUALIFICATION d'un état d'affichage) : la cascade calcule SA propre fenêtre, elle ne détourne pas le seuil d'alerte.
 *  - `rangVariante` : ordre chronologique d'une variante, pour décider idempotence (== cible → rien) vs transition (précède → migre).
 *
 * ⚠️ N'ENVOIE RIEN, ne décide d'aucune écriture : c'est `executerRelanceAuto` qui applique la qualification (délivrée, relève
 * fraîche, dossiers dus) et l'idempotence. Ici, uniquement de l'arithmétique de dates.
 */
import { echeanceDe } from './echeance';
import type { VarianteRelance } from './relance';

const MS_JOUR = 86_400_000;

/** Réglages de la cascade (config_veille, lot 2). `saisineDelaiJours` sert à `saisineLe`, pas à `etapeCible`. */
export interface ReglagesCascade {
  rappelJoursAvant: number;   // relance_rappel_jours_avant (défaut 10)
  avisJoursAvant: number;     // relance_avis_jours_avant (défaut 3)
  saisineDelaiJours: number;  // relance_saisine_delai_jours (défaut 4) — délai de dépôt de la saisine APRÈS l'échéance
}

/** Jours restants avant l'échéance (arrondi au jour SUPÉRIEUR, comme etatEcheance.joursRestants). Négatif une fois dépassée. */
export function joursAvantEcheance(envoyeLe: Date, maintenant: Date): number {
  return Math.ceil((echeanceDe(envoyeLe).getTime() - maintenant.getTime()) / MS_JOUR);
}

/** Date de dépôt ANNONCÉE de la saisine CADA = échéance + `saisineDelaiJours` (réglage). Utilisée par la variante 'saisine'. */
export function saisineLeDe(envoyeLe: Date, saisineDelaiJours: number): Date {
  return new Date(echeanceDe(envoyeLe).getTime() + saisineDelaiJours * MS_JOUR);
}

/**
 * ÉTAPE CIBLE au jour dit (PURE, testée au jour près). `reste` = jours avant l'échéance ; l'ordre des tests (saisine → avis →
 * rappel → aucune) rend la fenêtre 'rappel' NATURELLEMENT VIDE si `avisJoursAvant ≥ rappelJoursAvant` (réglages incohérents) :
 * on passe alors directement à 'avis', sans erreur ni plantage.
 *   reste ≤ 0                → 'saisine'   (échéance atteinte/dépassée)
 *   0 < reste ≤ avis         → 'avis'
 *   avis < reste ≤ rappel    → 'rappel'
 *   reste > rappel           → null        (trop tôt : aucune étape)
 */
export function etapeCible(envoyeLe: Date, maintenant: Date, reglages: ReglagesCascade): VarianteRelance | null {
  const reste = joursAvantEcheance(envoyeLe, maintenant);
  if (reste <= 0) return 'saisine';
  if (reste <= reglages.avisJoursAvant) return 'avis';
  if (reste <= reglages.rappelJoursAvant) return 'rappel';
  return null;
}

/** Variante telle qu'elle peut vivre en base : la cascade ('rappel'|'avis'|'saisine') OU l'héritée 'formelle' (lot A/B). */
export type VarianteEnBase = VarianteRelance | 'formelle';

/** Rang CHRONOLOGIQUE d'une variante dans la cascade. 'formelle' (héritée, au moment de l'échéance) ≡ 'saisine' → jamais migrée. */
export function rangVariante(v: VarianteEnBase): number {
  return v === 'rappel' ? 1 : v === 'avis' ? 2 : 3; // saisine ET formelle = 3
}
