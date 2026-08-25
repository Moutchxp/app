/**
 * PASTILLES D'ACTIONS — COMPTAGE PUR (client-safe, aucune I/O). Chaque compteur additionne EXACTEMENT ce que SON onglet affiche
 * comme action attendue d'Arno (seul lui peut la faire ; rien d'automatique). Aucun critère réécrit : la définition d'inclusion
 * « Réponses » est `demandeADuRetour` (réutilisée telle quelle depuis ReponsesRendu). Aucun chevauchement entre les trois.
 *
 * - Réponses      : dossiers à trancher + messages « autre » à qualifier (sur les demandes AVEC retour) + orphelins « à rattacher »
 *                   + dépôts à confirmer. Les relances préparées sont EXCLUES (automatiques).
 * - Saisines CADA : saisines possibles non lancées (saisissables) + envois à finaliser (file de dépôt).
 * - Rattachement  : permis en « arbitrage demandé » (valider / refuser / retour LiDAR).
 */
import { demandeADuRetour } from './ReponsesRendu';

/** Un dossier DÛ non encore tranché = en attente de la décision d'Arno (marquer reçu / non fourni / refus). PUR. */
export function dossierATrancher(d: { satisfait: boolean; triage: string | null }): boolean {
  return !d.satisfait && d.triage === null;
}
/** Un message « autre » (ancré, cas ③) non répondu = à qualifier (répondre / reclasser). PUR. */
export function messageAQualifier(m: { reponduLe: string | null }): boolean {
  return m.reponduLe === null;
}

export interface DemandeComptable {
  nbReponsesReelles: number;
  dossiersSatisfaits: number;
  dossiers: { satisfait: boolean; triage: string | null }[];
  messagesAutre: { reponduLe: string | null }[];
}

/** Compteur « Réponses » : actions attendues DANS l'onglet Réponses. */
export function compterReponses(data: { demandes: DemandeComptable[]; aRattacher: unknown[]; propositions: unknown[] }): number {
  const avecRetour = data.demandes.filter(demandeADuRetour); // même critère d'inclusion que l'onglet
  const aTrancher = avecRetour.reduce((s, d) => s + d.dossiers.filter(dossierATrancher).length, 0);
  const aQualifier = avecRetour.reduce((s, d) => s + d.messagesAutre.filter(messageAQualifier).length, 0);
  return aTrancher + aQualifier + data.aRattacher.length + data.propositions.length;
}

/** Compteur « Saisines CADA » : saisissables non lancées + file d'envois à finaliser. */
export function compterSaisines(data: { saisissables: unknown[]; fileADeposer: unknown[] }): number {
  return data.saisissables.length + data.fileADeposer.length;
}

/** Compteur « Rattachement » : permis en état `arbitrage_demande` (seule décision attendue d'Arno dans cet onglet). */
export function compterRattachement(compteurs: Record<string, number>): number {
  return compteurs['arbitrage_demande'] ?? 0;
}

export interface ComptesActions { reponses: number; saisines: number; rattachement: number; projection: number; total: number }

/** Assemble les compteurs + le cumul (calculé ICI, source unique → tuile et onglets ne divergent jamais). PROJ-2c ajoute « Projection ». */
export function assemblerComptes(reponses: number, saisines: number, rattachement: number, projection: number): ComptesActions {
  return { reponses, saisines, rattachement, projection, total: reponses + saisines + rattachement + projection };
}

/** Câblage : recompter APRÈS une action seulement si elle a RÉUSSI (une action en échec ne recompte pas). PUR. */
export function recompterSiSucces(ok: boolean, recompter?: () => void): void {
  if (ok) recompter?.();
}
