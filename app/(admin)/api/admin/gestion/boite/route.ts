import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { comptesBoite, lireBoiteMail, PAGE_BOITE, type CurseurBoite } from '../../../../../lib/gestion/boiteRepo';
import { lirePartenairesInternes } from '../../../../../lib/gestion/partenaires';

/**
 * /api/admin/gestion/boite (lot 5a) — LA BOÎTE MAIL : tous les échanges, du plus récent au plus ancien, par pages.
 *
 * 🔒 `exigerCompteActif(request, 'gestion')` — le MÊME garde que les autres lectures du module, relu en base à chaque
 * requête. Cette réponse contient des extraits de mails de locataires : `private, no-store` (ni cache partagé, ni
 * disque). Runtime Node (driver pg).
 *
 * 🔒 LECTURE SEULE : le graphe d'imports de ce fichier n'atteint aucun chemin d'écriture (`boiteRepo` n'émet que des
 * SELECT, `partenaires` aussi).
 *
 * PAGINATION PAR CURSEUR, jamais par `OFFSET` (voir `boiteRepo`). Le client renvoie tel quel le curseur qu'on lui a
 * donné ; il n'a pas à savoir ce qu'il contient.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const url = new URL(request.url);
  const dernierLe = url.searchParams.get('depuis');
  const filId = url.searchParams.get('avant');
  const inclureAutomatiques = url.searchParams.get('auto') === '1';

  // Le curseur n'est accepté qu'ENTIER : une moitié de curseur donnerait une page décalée, en silence.
  const curseur: CurseurBoite | null = dernierLe !== null && filId !== null && /^\d+$/.test(filId)
    ? { dernierLe, filId }
    : null;
  if ((dernierLe !== null) !== (filId !== null)) {
    return Response.json({ erreur: 'Curseur incomplet : « depuis » et « avant » vont ensemble.' }, { status: 422 });
  }

  try {
    const partenaires = await lirePartenairesInternes();
    const page = await lireBoiteMail(curseur, partenaires, PAGE_BOITE, { inclureAutomatiques });
    // Les deux comptes ne sont calculés qu'à la PREMIÈRE page : l'écran doit pouvoir dire ce qu'il montre ET ce qu'il
    //   tait, mais le redemander à chaque « voir plus » le paierait pour rien.
    const comptes = curseur === null ? await comptesBoite() : null;
    return Response.json({ ...page, comptes }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    // Pas de catch muet : une liste vide ferait croire à une boîte vide. On dit que la lecture a échoué.
    console.error('[api/admin/gestion/boite] lecture impossible', e);
    return Response.json({ erreur: 'Lecture impossible : la base n’a pas répondu.' }, { status: 503 });
  }
}
