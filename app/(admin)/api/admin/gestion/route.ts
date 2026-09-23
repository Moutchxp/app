import 'server-only';
import { exigerModule } from '../../../../lib/admin/garde';
import { lireEcran } from '../../../../lib/gestion/fileRepo';

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
    return Response.json(await lireEcran());
  } catch (e) {
    // Pas de catch muet : on journalise le motif réel côté serveur, et on rend une erreur DISTINGUABLE côté client —
    //   l'écran doit pouvoir dire « la base n'a pas répondu », jamais afficher une file vide qui ferait croire au calme.
    console.error('[api/admin/gestion] lecture impossible', e);
    return Response.json({ erreur: 'Lecture impossible : la base n’a pas répondu.' }, { status: 503 });
  }
}
