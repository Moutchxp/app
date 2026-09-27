import 'server-only';
import { exigerCompteActif } from '../../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../../lib/gestion/auteur';
import { poserEtoile } from '../../../../../../../lib/gestion/etoileRepo';

/**
 * /api/admin/gestion/fils/[id]/etoile (lot LISTE-GMAIL) — POSER OU DÉCROCHER L'ÉTOILE DE L'ÉQUIPE.
 *
 * 🔒 `exigerCompteActif(request, 'gestion')` — le même garde que le reste du module, relu en base à chaque requête.
 * Runtime Node (driver pg).
 *
 * 🔴 AUCUN APPEL À GMAIL. Cette étoile est un état de NOTRE application : le graphe d'imports de ce fichier
 * n'atteint aucun chemin Google. Celle de Gmail (libellé STARRED sur un message) a sa propre route et son propre
 * bouton, dans la conversation — les deux ne se touchent pas.
 *
 * 🔴 L'ÉTAT DEMANDÉ EST TRANSMIS, JAMAIS « L'INVERSE DE CE QUI EST LÀ ». Deux clics partis en même temps de deux
 * postes ne peuvent donc pas se croiser et laisser l'étoile dans l'état contraire de ce que les deux voulaient.
 */
export const runtime = 'nodejs';

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const { id } = await ctx.params;
  const filId = Number(id);
  if (!Number.isInteger(filId) || filId <= 0) {
    return Response.json({ erreur: 'Échange inconnu.' }, { status: 400 });
  }

  let corps: { etoilee?: unknown };
  try { corps = (await request.json()) as typeof corps; }
  catch { return Response.json({ erreur: 'Requête illisible.' }, { status: 400 }); }
  if (typeof corps.etoilee !== 'boolean') {
    return Response.json({ erreur: 'État d’étoile non reconnu.' }, { status: 400 });
  }

  try {
    const issue = await poserEtoile({ filId, etoilee: corps.etoilee, auteur: await auteurDeLaRequete(request) });
    // 409 et non 500 : « la migration n'est pas là » n'est pas une panne, c'est un état connu que l'écran sait dire.
    if (!issue.ok) return Response.json({ erreur: issue.motif }, { status: 409 });
    return Response.json({ ok: true, etoilee: issue.etoilee });
  } catch (e) {
    console.error('[api/admin/gestion/fils/etoile] écriture impossible', e);
    return Response.json({ erreur: 'Écriture impossible : la base n’a pas répondu.' }, { status: 503 });
  }
}
