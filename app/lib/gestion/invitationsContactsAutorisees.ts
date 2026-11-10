import 'server-only';
import { peutEnvoyerAuNomDeGestion } from './gardeEnvoi';
import { contactsAInviter, envoyerAuxContacts, refusRetouchesExterieurs, type EnvoiExterne } from './invitationsContactsRepo';
import { SORTES_MODIFIABLES_TACHE } from './mailTacheExterne';
import { lireRetouches, type Retouches } from '../location/texteModifiable';
import type { Auteur } from './gestes';

/**
 * 🔴 Arno (10/11/2026, migration 465) — APRÈS le geste (routes des tâches) : les contacts cochés « Envoyer une invitation » reçoivent CHACUN
 * leur mail (contenu restreint, seul destinataire), sous le MÊME droit d'envoi au nom de gestion@ que les invitations des collaborateurs
 * (relu en base) ; sans ce droit : rien ne part, et rien n'est annoncé comme parti.
 */
export async function envoisAuxContacts(request: Request, tacheId: number, ancien: Parameters<typeof envoyerAuxContacts>[1]['ancien'], auteur: Auteur,
  o: { annulation?: boolean; retouches?: Retouches } = {}): Promise<EnvoiExterne[]> {
  if (!(await contactsAInviter(tacheId))) return []; // aucun contact coché : rien à envoyer, aucune question de droit
  if (!(await peutEnvoyerAuNomDeGestion(request))) return [];
  return envoyerAuxContacts(tacheId, { ancien, ...(o.annulation === true ? { annulation: true } : {}),
    ...(o.retouches && Object.keys(o.retouches).length > 0 ? { retouches: o.retouches } : {}) }, auteur);
}

/**
 * 🔴 Arno (10/11/2026, texte modifiable) — les retouches des mails aux extérieurs, lues dans la requête (`retouchesExterieurs`) et CONTRÔLÉES
 * AVANT le geste : parties modifiables seulement, repères protégés gardés. Refusées : la route répond 400, rien n'est écrit, rien ne part.
 */
export function lireRetouchesExterieurs(corps: Record<string, unknown>): { ok: true; retouches: Retouches } | { ok: false; motif: string } {
  const rt = lireRetouches(corps.retouchesExterieurs, SORTES_MODIFIABLES_TACHE);
  if (!rt.ok) return rt;
  const refus = refusRetouchesExterieurs(rt.retouches);
  return refus === null ? rt : { ok: false, motif: refus };
}
