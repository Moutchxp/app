import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { suggererCorrespondants } from '../../../../../lib/gestion/redactionRepo';

/**
 * /api/admin/gestion/correspondants (lot 5e) — SUGGESTIONS du champ destinataire, tirées des correspondants DÉJÀ en
 * base. On ne propose que des gens à qui l'on a réellement parlé : pas de carnet d'adresses à tenir, pas de liste à
 * synchroniser, et aucune adresse inventée.
 *
 * 🔒 `exigerCompteActif(request,'gestion')` — ce sont des noms et des adresses de locataires et d'artisans.
 * `private, no-store`. Bornée à 10 résultats, et muette en dessous de deux caractères (voir `suggererCorrespondants`) :
 * un champ de saisie ne déclenche pas un balayage de 56 000 messages à la première lettre. Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const q = new URL(request.url).searchParams.get('q') ?? '';
  try {
    return Response.json({ correspondants: await suggererCorrespondants(q) },
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    console.error('[gestion/correspondants] recherche impossible', e);
    // Une suggestion est un CONFORT : si elle échoue, on rend une liste vide et la saisie à la main continue de marcher.
    return Response.json({ correspondants: [] });
  }
}
