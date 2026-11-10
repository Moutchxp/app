import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../lib/gestion/auteur';
import { tachesDisponibles } from '../../../../../../lib/gestion/schema';
import { lireSaisie } from '../../../../../../lib/gestion/taches';
import { apercuEnvoisTache, type GesteApercu } from '../../../../../../lib/gestion/invitationsContactsRepo';

/**
 * ══ 🔴🔴 LE RÉCAPITULATIF AVANT TOUT ENVOI D'UNE TÂCHE (Arno, 10/11/2026) — LECTURE SEULE ═════════════════════════════════════════
 * POST { geste, tacheId?, lotId?, …saisie (création, modification), jour/heure/dureeMinutes (décalage), inviteId, collaborateurId } →
 * les destinataires (collaborateurs et contacts extérieurs, séparés), le nombre d'invitations qui partiront, le texte reçu par un
 * collaborateur et par un extérieur. RIEN n'est écrit, RIEN ne part.
 */
export const runtime = 'nodejs';
const GESTES: readonly GesteApercu[] = ['creer', 'modifier', 'decaler', 'renvoyerDemande', 'renvoyerInvitation', 'changerDestinataire', 'annuler'];

export async function POST(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  if (!await tachesDisponibles()) return Response.json({ erreur: 'Les tâches ne sont pas encore installées (migration 346).' }, { status: 503 });
  const corps = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const geste = String(corps.geste ?? '') as GesteApercu;
  if (!GESTES.includes(geste)) return Response.json({ erreur: 'Geste inconnu.' }, { status: 400 });
  const entier = (x: unknown): number | null => { const n = Number(x); return Number.isInteger(n) && n > 0 ? n : null; };
  const heure = typeof corps.heure === 'string' && corps.heure.trim() !== '' ? corps.heure.trim() : null;
  try {
    const a = await apercuEnvoisTache({
      geste, auteur: await auteurDeLaRequete(request), tacheId: entier(corps.tacheId), lotId: entier(corps.lotId),
      ...(geste === 'creer' || geste === 'modifier' ? { saisie: lireSaisie(corps) } : {}),
      ...(geste === 'decaler' && typeof corps.jour === 'string' ? { moment: { jour: corps.jour.trim(), heure, dureeMinutes: heure === null ? null : entier(corps.dureeMinutes) } } : {}),
      inviteId: entier(corps.inviteId), collaborateurId: entier(corps.collaborateurId),
    });
    return Response.json({ etat: 'ok', ...a }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    console.error('[gestion/taches/apercu] lecture impossible', e);
    return Response.json({ erreur: 'Récapitulatif impossible : la base n’a pas répondu. Rien n’a été envoyé.' }, { status: 503 });
  }
}
