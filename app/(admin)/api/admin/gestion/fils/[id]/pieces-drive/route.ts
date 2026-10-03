import 'server-only';
import { exigerCompteActif } from '../../../../../../../lib/admin/garde';
import { lireDepotsDuFil } from '../../../../../../../lib/gestion/driveRepo';
import { emplacementsDesPieces } from '../../../../../../../lib/gestion/pieceDansLeDriveRepo';
import { depotsDriveDisponibles } from '../../../../../../../lib/gestion/schema';

/**
 * GET /api/admin/gestion/fils/[id]/pieces-drive (lot PIECES-DE-LA-CONVERSATION) — CE QUI EST DÉJÀ DANS LE DRIVE,
 * pour TOUT un échange.
 *
 * 🔴 POURQUOI UNE ROUTE D'ÉCHANGE ET NON DOUZE ROUTES DE MESSAGE. Le récapitulatif des pièces s'ouvre d'un clic et
 * montre les pièces de tous les messages : c'est lui qui a besoin de la réponse entière, d'un coup. La route par
 * message (`/messages/[id]/drive`) reste ce qu'elle était, et sert toujours les cartes d'un message déplié — les
 * deux lisent la MÊME table par le MÊME repo, et rendent la MÊME forme de dépôt.
 *
 * ⚠️ LECTURE SEULE, ET RIEN QUE LA MÉMOIRE DES DÉPÔTS. Aucun appel à Google : on ne demande pas au Drive ce que
 * notre base sait déjà. Un dossier renommé là-bas ne changera donc pas le nom affiché tant qu'aucun nouveau dépôt
 * n'y est fait — c'est déjà le comportement de la carte d'une pièce, et la même vérité pour les deux.
 *
 * ⚠️ MIGRATION 245 ABSENTE ⇒ LISTE VIDE, PAS UNE ERREUR : il ne PEUT alors pas y avoir de dépôt, et la fenêtre
 * s'affiche simplement sans aucune mention « Dans le Drive ».
 *
 * 🔒 `exigerCompteActif` : la réponse dit dans quel dossier client une pièce a été rangée. `private, no-store` : ni
 * cache partagé, ni disque. Runtime Node (driver pg).
 */
export const runtime = 'nodejs';

const SANS_CACHE = 'private, no-store';
type Contexte = { params: Promise<{ id: string }> };

function json(corps: unknown, status = 200): Response {
  return Response.json(corps, { status, headers: { 'Cache-Control': SANS_CACHE } });
}

export async function GET(request: Request, ctx: Contexte): Promise<Response> {
  const barrage = await exigerCompteActif(request, 'gestion');
  if (barrage) {
    const e = new Headers(barrage.headers);
    e.set('Cache-Control', SANS_CACHE);
    return new Response(barrage.body, { status: barrage.status, statusText: barrage.statusText, headers: e });
  }

  const filId = Number((await ctx.params).id);
  if (!Number.isInteger(filId) || filId <= 0) return json({ erreur: 'Échange inconnu.' }, 400);

  if (!await depotsDriveDisponibles()) return json({ etat: 'sans_schema', depots: [], emplacements: [] });

  try {
    /**
     * 🔴🔴 LOT PICTO-PIECE-DANS-LE-DRIVE, POINT 1 — « vaut PARTOUT où les miniatures de pièces reçues
     * apparaissent » (Arno). Le récapitulatif de la conversation en fait partie, et il reçoit le statut par la
     * MÊME route qu'il appelle déjà : une seule requête pour tout l'échange, et aucun appel Google.
     *
     * ⚠️ `depots` ET `emplacements` RESTENT DEUX CHOSES — voir l'encadré de la route d'un message.
     */
    const [depots, emplacements] = await Promise.all([
      lireDepotsDuFil(filId), emplacementsDesPieces({ filId }),
    ]);
    return json({ etat: 'ok', depots, emplacements });
  } catch (e) {
    console.error('[gestion/fil/pieces-drive] lecture des dépôts impossible', e);
    return json({ etat: 'erreur', depots: [], emplacements: [] }, 503);
  }
}
