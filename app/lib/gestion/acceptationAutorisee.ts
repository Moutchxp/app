import 'server-only';
import { peutEnvoyerAuNomDeGestion } from './gardeEnvoi';
import { envoyerSiBesoin, type DemandePosee } from './acceptationRepo';
import type { EtatMail } from './acceptationTache';

/**
 * ══ AUDIT POINT 9 (15/10/2026) — LE MAIL D'ACCEPTATION D'UNE TÂCHE EXIGE LE DROIT D'ENVOI AU NOM DE gestion@ ══════════════
 *
 * Le mail de demande d'acceptation part AU NOM DE gestion@. Il passe donc par la MÊME garde que tout envoi au nom de
 * l'agence (`peutEnvoyerAuNomDeGestion`, relue en base à chaque fois) : sans le droit, AUCUN mail — la tâche est créée, la
 * demande reste « en attente » et la personne la voit dans « Mes tâches », où elle peut accepter ou refuser. Une demande
 * acceptée d'office (tâche confiée à soi-même : pas de jeton) n'envoie rien et ne pose pas la question.
 * `'sans_droit'` n'est jamais écrit en base (la colonne `mail_etat` garde « aucun ») : c'est seulement ce que dit la route.
 */
export type EtatMailRoute = EtatMail | 'sans_droit';

export async function envoyerSiAutorise(request: Request, demande: DemandePosee | null | undefined): Promise<EtatMailRoute | null> {
  if (!demande || demande.jeton === null) return null;
  if (!(await peutEnvoyerAuNomDeGestion(request))) return 'sans_droit';
  return envoyerSiBesoin(demande);
}
