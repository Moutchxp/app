import 'server-only';
import { exigerCompteActif } from '../../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../../lib/gestion/auteur';
import { depsReellesDepot, piecesDeposablesDuMessage } from '../../../../../../../lib/gestion/depotDriveReel';
import { deposerPieces, resumerDepot } from '../../../../../../../lib/gestion/depotDrive';
import { lireDepotsDesPieces } from '../../../../../../../lib/gestion/driveRepo';
import { jetonAccesGestion } from '../../../../../../../lib/gestion/jetonAcces';
import { depotsDriveDisponibles } from '../../../../../../../lib/gestion/schema';

/**
 * POST /api/admin/gestion/messages/[id]/drive (lot 5-PJ-B) — « TOUT AJOUTER AU DRIVE ».
 *
 * 🔴 UN SEUL CHOIX DE DOSSIER POUR TOUTES LES PIÈCES DU MESSAGE, et un RÉSULTAT PAR PIÈCE. Huit pièces peuvent très
 * bien donner six dépôts, un « déjà là » et un échec : un « OK » global serait faux, et un « échec » global ferait
 * recommencer six dépôts réussis. La réponse porte donc la liste, et l'écran l'affiche telle quelle.
 *
 * 🔒 Mêmes règles que pour une pièce seule : droit `gestion` relu à chaque requête, jeton Google jamais rendu au
 * navigateur, aucune URL de stockage, aucun original effacé.
 */
export const runtime = 'nodejs';

const SANS_CACHE = 'private, no-store';
type Contexte = { params: Promise<{ id: string }> };

function json(corps: unknown, status = 200): Response {
  return Response.json(corps, { status, headers: { 'Cache-Control': SANS_CACHE } });
}
function sansCache(reponse: Response): Response {
  const e = new Headers(reponse.headers);
  e.set('Cache-Control', SANS_CACHE);
  return new Response(reponse.body, { status: reponse.status, statusText: reponse.statusText, headers: e });
}

/**
 * GET — CE QUI EST DÉJÀ DANS LE DRIVE, pour ce message. Une seule requête pour tout un message, au dépliage : c'est
 * elle qui fait apparaître « Dans le Drive · ouvrir » sur les cartes concernées. Une requête par carte aurait multiplié
 * les allers-retours pour la même réponse.
 */
export async function GET(request: Request, ctx: Contexte): Promise<Response> {
  const barrage = await exigerCompteActif(request, 'gestion');
  if (barrage) return sansCache(barrage);

  const messageId = Number((await ctx.params).id);
  if (!Number.isInteger(messageId) || messageId <= 0) return json({ erreur: 'Message inconnu.' }, 400);

  // Sans la migration 245, il ne PEUT pas y avoir de dépôt : on rend une liste vide plutôt qu'une erreur, et l'écran
  //   affiche simplement des cartes sans mention Drive. Rien ne casse.
  if (!await depotsDriveDisponibles()) return json({ etat: 'sans_schema', depots: [] });

  try {
    const pieces = await piecesDeposablesDuMessage(messageId);
    const depots = pieces.length === 0 ? [] : await lireDepotsDesPieces(pieces);
    return json({ etat: 'ok', depots });
  } catch (e) {
    console.error('[gestion/message/drive] lecture des dépôts impossible', e);
    return json({ etat: 'erreur', depots: [] }, 503);
  }
}

export async function POST(request: Request, ctx: Contexte): Promise<Response> {
  const barrage = await exigerCompteActif(request, 'gestion');
  if (barrage) return sansCache(barrage);

  const messageId = Number((await ctx.params).id);
  if (!Number.isInteger(messageId) || messageId <= 0) return json({ erreur: 'Message inconnu.' }, 400);

  const corps = (await request.json().catch(() => ({}))) as { dossierId?: string };
  const dossierId = (corps.dossierId ?? '').trim();
  if (dossierId === '') return json({ erreur: 'Aucun dossier choisi.' }, 400);

  if (!await depotsDriveDisponibles()) {
    return json({ etat: 'sans_schema', message: 'Bientôt disponible — une mise à jour de la base est nécessaire.' }, 409);
  }
  const acces = await jetonAccesGestion();
  if (acces.etat !== 'ok') return json({ etat: acces.etat, message: acces.motif }, 409);

  try {
    const pieces = await piecesDeposablesDuMessage(messageId);
    if (pieces.length === 0) return json({ etat: 'ok', resultats: [], resume: 'Aucune pièce conservée à déposer.' });
    const auteur = await auteurDeLaRequete(request);
    const issues = await deposerPieces(depsReellesDepot(), acces.jeton, pieces, dossierId, auteur);
    return json({ etat: 'ok', resultats: issues, resume: resumerDepot(issues) });
  } catch (e) {
    console.error('[gestion/message/drive] dépôt impossible', e);
    return json({ etat: 'erreur', message: 'Le dépôt n’a pas abouti.' }, 503);
  }
}
