import 'server-only';
import { peutEnvoyerAuNomDeGestion } from './gardeEnvoi';
import { contactsAInviter, envoyerAuxContacts, type EnvoiExterne } from './invitationsContactsRepo';
import type { Auteur } from './gestes';

/**
 * 🔴 Arno (10/11/2026, migration 465) — APRÈS le geste (routes des tâches) : les contacts cochés « Envoyer une invitation » reçoivent CHACUN
 * leur mail (contenu restreint, seul destinataire), sous le MÊME droit d'envoi au nom de gestion@ que les invitations des collaborateurs
 * (relu en base) ; sans ce droit : rien ne part, et rien n'est annoncé comme parti.
 */
export async function envoisAuxContacts(request: Request, tacheId: number, ancien: Parameters<typeof envoyerAuxContacts>[1]['ancien'], auteur: Auteur,
  o: { annulation?: boolean } = {}): Promise<EnvoiExterne[]> {
  if (!(await contactsAInviter(tacheId))) return []; // aucun contact coché : rien à envoyer, aucune question de droit
  if (!(await peutEnvoyerAuNomDeGestion(request))) return [];
  return envoyerAuxContacts(tacheId, { ancien, ...(o.annulation === true ? { annulation: true } : {}) }, auteur);
}
