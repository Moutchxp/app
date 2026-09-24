import 'server-only';
import { exigerCompteActif } from '../../../../../../../lib/admin/garde';
import { lireCorpsDuMessage } from '../../../../../../../lib/gestion/carteRepo';

/**
 * /api/admin/gestion/messages/[id]/corps (lot 5b) — LE CORPS D'UN SEUL MESSAGE, chargé au dépliage.
 *
 * POURQUOI CETTE ROUTE EXISTE. Le plus gros échange de la boîte compte 102 messages. Les envoyer tous avec leur corps
 * complet ferait traverser le réseau à des centaines de kilo-octets pour qu'on en lise UN — et sur un téléphone en 4G,
 * c'est la différence entre un écran qui s'ouvre et un écran qui rame. La conversation part donc avec le corps du
 * DERNIER message (celui qu'on déplie d'emblée) et les extraits des autres ; chaque dépliage vient chercher le sien.
 *
 * 🔒 `exigerCompteActif(request, 'gestion')` — le MÊME garde que les autres lectures du module, relu en base à chaque
 * requête. Le droit est revérifié À CHAQUE corps demandé : un droit retiré ferme la porte au message suivant, pas à la
 * prochaine connexion.
 *
 * 🔒 LECTURE SEULE, `private, no-store` : c'est le texte d'un mail de locataire, il n'a rien à faire dans un cache
 * partagé ni sur un disque. Runtime Node (driver pg).
 */
export const runtime = 'nodejs';

type Contexte = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Contexte): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const brut = Number((await ctx.params).id);
  if (!Number.isInteger(brut) || brut <= 0) return Response.json({ erreur: 'Message inconnu.' }, { status: 400 });

  try {
    const lu = await lireCorpsDuMessage(brut);
    if (!lu) return Response.json({ erreur: 'Ce message n’existe pas.' }, { status: 404 });
    return Response.json(lu, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    console.error('[gestion/messages/corps] lecture impossible', e);
    return Response.json({ erreur: 'Lecture impossible : erreur interne du serveur.' }, { status: 503 });
  }
}
