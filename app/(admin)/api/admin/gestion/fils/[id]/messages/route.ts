import 'server-only';
import { exigerCompteActif } from '../../../../../../../lib/admin/garde';
import { lireMessagesDuFil } from '../../../../../../../lib/gestion/carteRepo';

/**
 * /api/admin/gestion/fils/[id]/messages (lot 4c) — LE CONTENU D'UN ÉCHANGE : ses messages dans l'ordre où la
 * conversation s'est déroulée, et la liste de ses pièces jointes.
 *
 * Appelé au DÉPLIAGE d'un échange, jamais avant : c'est ce qui permet à une carte de six fils de ne rien coûter tant
 * qu'on ne l'ouvre pas.
 *
 * ⚠️ AUCUNE CLÉ DE STOCKAGE dans la réponse. Une pièce est désignée par son identifiant ; ses octets sont servis par
 * `/api/admin/gestion/pieces/[id]`, qui revérifie le droit à CHAQUE ouverture.
 *
 * 🔒 `exigerCompteActif` : cette réponse contient le texte de mails de locataires. `private, no-store` : ni cache
 * partagé, ni disque. Runtime Node (driver pg).
 */
export const runtime = 'nodejs';

type Contexte = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Contexte): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const brut = Number((await ctx.params).id);
  if (!Number.isInteger(brut) || brut <= 0) return Response.json({ erreur: 'Échange inconnu.' }, { status: 400 });
  try {
    const messages = await lireMessagesDuFil(brut);
    if (!messages) return Response.json({ erreur: 'Cet échange n’existe pas.' }, { status: 404 });
    return Response.json({ messages }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    console.error('[gestion/messages] lecture impossible', e);
    return Response.json({ erreur: 'Lecture impossible : erreur interne du serveur.' }, { status: 503 });
  }
}
