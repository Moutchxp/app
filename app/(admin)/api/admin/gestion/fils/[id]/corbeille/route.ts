import 'server-only';
import { exigerCompteActif } from '../../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../../lib/gestion/auteur';
import { mettreALaCorbeille } from '../../../../../../../lib/gestion/corbeilleRepo';

/**
 * /api/admin/gestion/fils/[id]/corbeille (lot 5-BOITE-3) — METTRE UN ÉCHANGE À LA CORBEILLE, OU L'EN SORTIR.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LA CORBEILLE EST INTERNE, ET LE MAIL RESTE INTACT DANS GMAIL. Aucun `TRASH` n'est posé ; la portée qui le
 * permettrait n'est même pas demandée. Ce verbe ne fait qu'une chose : retirer l'échange de ses boîtes.
 *
 * 🔴 DEUX VERBES POUR DEUX SENS, comme « sans suite » depuis le lot 4b : POST met à la corbeille, DELETE restaure.
 * Un seul verbe avec un drapeau dans le corps rendrait le geste inverse invisible dans les journaux d'accès — et un
 * geste réversible doit se lire aussi facilement dans les deux sens.
 *
 * 🔒 Le droit est celui qui permet déjà de LIRE l'échange (`gestion`), relu en base à chaque requête : mettre à la
 * corbeille n'expose rien de plus, et se défait d'un clic.
 *
 * ⚠️ L'AUTEUR EST FIGÉ EN TEXTE dans le journal — des années après, on doit savoir qui a fait le geste même si le
 * compte a été désactivé ou purgé.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const SANS_CACHE = 'private, no-store';
type Contexte = { params: Promise<{ id: string }> };

function json(corps: unknown, status = 200): Response {
  return Response.json(corps, { status, headers: { 'Cache-Control': SANS_CACHE } });
}

async function agir(request: Request, ctx: Contexte, versLaCorbeille: boolean): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const filId = Number((await ctx.params).id);
  if (!Number.isInteger(filId) || filId <= 0) return json({ erreur: 'Échange inconnu.' }, 400);

  try {
    const auteur = await auteurDeLaRequete(request);
    const issue = await mettreALaCorbeille(filId, versLaCorbeille, auteur);
    if (issue.etat === 'sans_schema') {
      return json({ etat: 'sans_schema', message: 'Bientôt disponible — une mise à jour de la base est nécessaire.' }, 409);
    }
    if (issue.etat === 'inconnu') return json({ etat: 'inconnu', message: 'Cet échange n’existe pas.' }, 404);
    return json({
      etat: 'ok',
      corbeille: versLaCorbeille,
      message: versLaCorbeille
        ? 'Échange mis à la corbeille. Rien n’est supprimé : il reste en base, il reste intact dans Gmail, et un '
          + 'nouveau message le fera revenir tout seul.'
        : 'Échange restauré : il est revenu dans sa boîte, avec tous ses messages.',
    });
  } catch (e) {
    console.error('[gestion/fil/corbeille] geste impossible', e);
    return json({ etat: 'erreur', message: 'Le geste n’a pas abouti.' }, 503);
  }
}

export function POST(request: Request, ctx: Contexte): Promise<Response> {
  return agir(request, ctx, true);
}

export function DELETE(request: Request, ctx: Contexte): Promise<Response> {
  return agir(request, ctx, false);
}
