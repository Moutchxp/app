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
import { demandeEnCoursIncomplete } from '../../../../lib/sitadel/demandesListe'; // LOT 46 — prédicat PARTAGÉ ligne « En cours » à relancer (compteur d'onglet = nb de lignes allumées)
import { ETATS_A_FAIRE } from '../../../../lib/permis/rattachementGroupes'; // SOURCE UNIQUE des états « à faire » comptés par la pastille Rattachement

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
export function compterReponses(data: { demandes: DemandeComptable[]; aRattacher: unknown[]; propositions: unknown[]; liensATelecharger?: unknown[] }): number {
  const avecRetour = data.demandes.filter(demandeADuRetour); // même critère d'inclusion que l'onglet
  const aTrancher = avecRetour.reduce((s, d) => s + d.dossiers.filter(dossierATrancher).length, 0);
  const aQualifier = avecRetour.reduce((s, d) => s + d.messagesAutre.filter(messageAQualifier).length, 0);
  // GED-1 — chaque « lien de téléchargement disponible » (lien fort + GED vide) est une action en attente : il compte dans la pastille.
  return aTrancher + aQualifier + data.aRattacher.length + data.propositions.length + (data.liensATelecharger?.length ?? 0);
}

/** Compteur « Saisines CADA » : saisissables non lancées + file d'envois à finaliser. */
export function compterSaisines(data: { saisissables: unknown[]; fileADeposer: unknown[] }): number {
  return data.saisissables.length + data.fileADeposer.length;
}

/** LOT 46 — compteur « En cours » : nombre de demandes affichées en « En cours » à dossier INCOMPLET à relancer (prédicat partagé
 *  `demandeEnCoursIncomplete`). PAR CONSTRUCTION égal à la somme des pastilles de ligne (même prédicat, même donnée). PUR. */
export function compterEnCoursIncomplet(demandes: Parameters<typeof demandeEnCoursIncomplete>[0][]): number {
  return demandes.filter(demandeEnCoursIncomplete).length;
}

/** Compteur « Rattachement » : permis dans un état « à faire » (décision attendue d'Arno) — SOURCE UNIQUE `ETATS_A_FAIRE`
 *  (`arbitrage_demande` + ÉTAGE 1 `acheve_sans_bati`). Même pastille, aucun nouveau compteur : on somme les états à faire. */
export function compterRattachement(compteurs: Record<string, number>): number {
  return ETATS_A_FAIRE.reduce((s, etat) => s + (compteurs[etat] ?? 0), 0);
}

export interface ComptesActions { reponses: number; saisines: number; rattachement: number; projection: number; surveillance: number; total: number }

/** Assemble les compteurs + le cumul (calculé ICI, source unique → tuile et onglets ne divergent jamais). PROJ-2c ajoute
 *  « Projection » ; SURV-1 ajoute « Surveillance » (dossiers validés en fenêtre dont les polygones ont bougé, à vérifier). */
export function assemblerComptes(reponses: number, saisines: number, rattachement: number, projection: number, surveillance: number): ComptesActions {
  return { reponses, saisines, rattachement, projection, surveillance, total: reponses + saisines + rattachement + projection + surveillance };
}

/** Câblage : recompter APRÈS une action seulement si elle a RÉUSSI (une action en échec ne recompte pas). PUR. */
export function recompterSiSucces(ok: boolean, recompter?: () => void): void {
  if (ok) recompter?.();
}
