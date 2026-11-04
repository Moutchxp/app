import 'server-only';
import { exigerCompteActif } from '../../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../../lib/gestion/auteur';
import { vuParLaCarte } from '../../../../../../../lib/gestion/nouveauteEvenement';

/**
 * POST /api/admin/gestion/evenements/[id]/nouveaute-vue — LOT NEW-EVENEMENT-PROPRE (Arno, 04/11/2026).
 *
 * 🔴 DÉPLIER LA CARTE D'UN ÉVÉNEMENT ÉTEINT SON « NEW », pour toute l'équipe (comme le lu / non lu de Gmail). Les
 * mails, eux, ne changent PAS dans Gmail : déplier n'est pas lire. Le « New » ne revient qu'avec un nouveau mail
 * reçu rattaché à l'événement.
 *
 * ⚠️ IDEMPOTENT (le seuil ne recule jamais), et sans la migration 456 il n'y a rien à écrire : `marques: 0`.
 */
export const runtime = 'nodejs';

type Contexte = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Contexte): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const id = Number((await ctx.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ erreur: 'Événement inconnu.' }, { status: 400 });
  try {
    const marques = await vuParLaCarte(id, (await auteurDeLaRequete(request)).libelle);
    return Response.json({ etat: 'ok', marques });
  } catch (e) {
    console.error('[gestion/evenements/nouveaute-vue] marquage impossible', e);
    return Response.json({ erreur: 'Marquage impossible : erreur interne du serveur.' }, { status: 503 });
  }
}
