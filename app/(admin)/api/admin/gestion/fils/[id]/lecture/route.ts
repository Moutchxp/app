import 'server-only';
import { exigerCompteActif } from '../../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../../lib/gestion/auteur';
import { marquerFil } from '../../../../../../../lib/gestion/lectureRepo';

/**
 * POST /api/admin/gestion/fils/[id]/lecture (lot 5-BOITE) — MARQUER UN ÉCHANGE LU, OU NON LU, POUR MOI.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 « POUR MOI », ET L'IDENTITÉ VIENT DE LA SESSION — jamais du corps de la requête. Accepter un identifiant envoyé
 * par le navigateur permettrait de marquer lu le courrier de quelqu'un d'autre, c'est-à-dire de le lui faire
 * disparaître du gras sans qu'il l'ait ouvert.
 *
 * 🔴 IDEMPOTENT. La vue conversation appelle cette route à CHAQUE ouverture d'échange : elle doit pouvoir être
 * rejouée mille fois sans produire ni doublon, ni erreur, ni ligne de journal. C'est `ON CONFLICT … DO UPDATE` qui
 * le tient, en base (cf. `lectureRepo`).
 *
 * 🔒 SEULS LES MESSAGES REÇUS sont touchés, et rien d'autre : aucune écriture sur `gestion_message`, aucun drapeau
 * Gmail posé ni lu (la boîte reste ouverte en lecture stricte par la relève).
 *
 * ⚠️ CE N'EST PAS « TRAITÉ ». « À traiter / traité par X » dit où en est le TRAVAIL et reste commun à l'équipe ;
 * cette route-ci ne touche qu'à « moi, je l'ai ouvert ». Les deux sont volontairement séparés.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const SANS_CACHE = 'private, no-store';
type Contexte = { params: Promise<{ id: string }> };

function json(corps: unknown, status = 200): Response {
  return Response.json(corps, { status, headers: { 'Cache-Control': SANS_CACHE } });
}

export async function POST(request: Request, ctx: Contexte): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const filId = Number((await ctx.params).id);
  if (!Number.isInteger(filId) || filId <= 0) return json({ erreur: 'Échange inconnu.' }, 400);

  const corps = (await request.json().catch(() => ({}))) as { lu?: unknown };
  // `lu` doit être dit EXPLICITEMENT : deviner « lu » par défaut ferait d'un appel malformé un geste silencieux.
  if (typeof corps.lu !== 'boolean') return json({ erreur: 'Préciser « lu » : true ou false.' }, 400);

  try {
    const { id } = await auteurDeLaRequete(request);
    const issue = await marquerFil(filId, id, corps.lu);
    if (issue.etat === 'sans_schema') {
      return json({ etat: 'sans_schema', message: 'Bientôt disponible — une mise à jour de la base est nécessaire.' }, 409);
    }
    // Accès de secours (mot de passe partagé) : aucune identité personnelle, donc aucun état de lecture personnel.
    //   Ce n'est pas une panne, c'est la conséquence normale d'un accès qui n'est au nom de personne.
    if (issue.etat === 'sans_compte') {
      return json({ etat: 'sans_compte', message: 'Cet accès n’est rattaché à aucun compte : le suivi de lecture est personnel.' }, 409);
    }
    return json({ etat: 'ok', lu: corps.lu, messages: issue.messages });
  } catch (e) {
    console.error('[gestion/fil/lecture] écriture impossible', e);
    return json({ etat: 'erreur', message: 'Le marquage n’a pas abouti.' }, 503);
  }
}
