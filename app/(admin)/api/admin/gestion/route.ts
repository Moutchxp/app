import 'server-only';
import { exigerModule } from '../../../../lib/admin/garde';
// 🔴 LOT LISTE-PAGINATION — la file « Sans événement » se pagine : 25 par page, comme toutes les listes du module.
import { lireEcran } from '../../../../lib/gestion/fileRepo';
import { PAR_PAGE as PAGE_FILE } from '../../../../lib/gestion/pagination';

/**
 * /api/admin/gestion (lot 2) — état de l'écran à deux côtés : la FILE des échanges à classer, et les CARTES d'événement.
 *
 * 🔒 DEUX BARRIÈRES INDÉPENDANTES, comme partout dans l'admin : `proxy.ts` refuse déjà le préfixe `/api/admin/gestion` à
 * qui n'a pas `perm_gestion` ; `exigerModule` le re-vérifie ici EN RELISANT LA BASE — un droit retiré coupe l'accès au
 * prochain appel, sans attendre l'expiration du jeton (qui vit jusqu'à 8 h).
 *
 * 🔒 LECTURE SEULE : le graphe d'imports de ce fichier ne contient AUCUN chemin d'écriture (fileRepo n'émet que des
 * SELECT). Les gestes — affecter à un événement, classer sans suite — sont le lot 4 et passeront par d'autres verbes.
 *
 * Runtime Node (driver pg).
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerModule(request, 'gestion');
  if ('refus' in garde) return garde.refus;

  try {
    /**
     * ══ 🔴 LOT LISTE-PAGINATION — `?filePage=N` : LE RANG DE LA PAGE DE LA FILE « SANS ÉVÉNEMENT » ═════════════
     *
     * Absent ⇒ 0, c'est-à-dire EXACTEMENT le comportement d'avant ce lot : tous les appels existants (l'écran
     * partagé, le rafraîchissement, les épreuves) ne changent pas d'un iota.
     *
     * ⚠️ UNE VALEUR ILLISIBLE OU NÉGATIVE RETOMBE SUR 0, jamais une erreur 422 : une adresse collée de travers
     * doit montrer la première page, pas un écran de panne. C'est la même tolérance que `lireEtatUrl`.
     */
    const brut = new URL(request.url).searchParams.get('filePage');
    const pageFile = brut !== null && /^\d+$/.test(brut) ? Math.min(Number(brut), 10_000) : 0;
    return Response.json(await lireEcran(PAGE_FILE, pageFile));
  } catch (e) {
    // Pas de catch muet : on journalise le motif réel côté serveur, et on rend une erreur DISTINGUABLE côté client —
    //   l'écran doit pouvoir dire « la base n'a pas répondu », jamais afficher une file vide qui ferait croire au calme.
    console.error('[api/admin/gestion] lecture impossible', e);
    return Response.json({ erreur: 'Lecture impossible : la base n’a pas répondu.' }, { status: 503 });
  }
}
