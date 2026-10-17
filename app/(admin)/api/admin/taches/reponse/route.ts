import 'server-only';
import { NOM_COOKIE, sessionDepuisPayload, verifierJeton } from '../../../../../lib/admin/session';
import { acceptationTacheDisponible } from '../../../../../lib/gestion/schema';
import { agendaApresAcceptation, compteSelonRegle, envoyerConfirmationAcceptation, envoyerRecapitulatif, repondreDemande } from '../../../../../lib/gestion/acceptationRepo';
/* 🔴 LOT TACHES-AGENDA — acceptée : elle entre dans l'agenda du destinataire ; refusée : elle n'y est pas. */
import { synchroniserApresGeste } from '../../../../../lib/gestion/agendaSynchroRepo';

/**
 * ══ 🔴🔴 LOT TACHES-ACCEPTATION — ACCEPTER OU REFUSER UNE TÂCHE CONFIÉE ═══════════════════════════════════════════
 *
 * `POST { jeton?, tacheId?, decision: 'accepter' | 'refuser', motif? }`.
 *   · par le JETON du mail : il n'agit que pour son destinataire, une seule fois, avant son expiration ;
 *   · par la TÂCHE (depuis « Mes tâches », sans jeton) : seulement pour son destinataire connecté.
 * « Refuser » exige un motif. Les refus sont rendus en clair (lien expiré, déjà utilisé, remplacé, autre personne).
 *
 * 🔒 Ouvert à tout compte qui remplit la règle « Confiée à » (proxy : chemin authentifié seul), relue ICI en base.
 * Aucun mail n'est envoyé par cette route. 🔴 LOT TACHES-AGENDA : la réponse est suivie de la synchronisation de l'agenda
 * (réglage actif seulement) ; un échec de Google n'annule pas la réponse, il se dit.
 */
export const runtime = 'nodejs';

const json = (corps: unknown, status = 200) => Response.json(corps, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function POST(request: Request): Promise<Response> {
  const brut = (request.headers.get('cookie') ?? '').split(';').map((p) => p.trim()).find((p) => p.startsWith(`${NOM_COOKIE}=`));
  const payload = brut ? await verifierJeton(decodeURIComponent(brut.slice(NOM_COOKIE.length + 1))) : null;
  if (!payload) return json({ erreur: 'Session expirée, reconnecte-toi.' }, 401);
  const compte = await compteSelonRegle(sessionDepuisPayload(payload).sub);
  if (compte === null) {
    return json({ erreur: 'Ce compte ne peut pas recevoir de tâche (compte actif avec une adresse de notre Workspace requis).' }, 403);
  }
  if (!(await acceptationTacheDisponible())) return json({ erreur: 'Acceptation non installée (migration 349).' }, 503);
  const corps = (await request.json().catch(() => ({}))) as { jeton?: unknown; tacheId?: unknown; decision?: unknown; motif?: unknown };
  const decision = corps.decision === 'accepter' || corps.decision === 'refuser' ? corps.decision : null;
  if (decision === null) return json({ erreur: 'Choisissez « Accepter » ou « Refuser ».' }, 400);
  const jeton = typeof corps.jeton === 'string' ? corps.jeton.trim() : '';
  const tacheId = Number(corps.tacheId);
  if (jeton === '' && !(Number.isInteger(tacheId) && tacheId > 0)) return json({ erreur: 'Demande inconnue.' }, 400);
  const r = await repondreDemande({
    jeton: jeton === '' ? null : jeton, tacheId: jeton === '' ? tacheId : null, decision,
    motif: typeof corps.motif === 'string' ? corps.motif : null,
    utilisateur: { id: compte.id, libelle: compte.nom }, nom: compte.nom,
  });
  if (!r.ok) return json({ erreur: r.message }, r.statut);
  const agenda = await synchroniserApresGeste(r.tacheId);
  /* 🔴 LOT GESTION-INVITATIONS-TACHES (lot 3) — acceptée : le récapitulatif de la mission, par le canal de l'invitation. */
  if (r.statut === 'acceptee' && r.demandeId !== undefined) {
    await envoyerRecapitulatif(r.demandeId, agendaApresAcceptation(agenda));
    /* 🔴 LOT GESTION-CONFIRMATION-ACCEPTATION — la confirmation à gestion@ et au collaborateur qui a envoyé l'invitation. */
    await envoyerConfirmationAcceptation(r.demandeId);
  }
  return json({ etat: 'ok', statut: r.statut, message: `${r.message}${agenda}` });
}
