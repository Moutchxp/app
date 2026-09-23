import 'server-only';
import { exigerCompteActif } from '../../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../../lib/gestion/auteur';
import { classerSansSuite, rouvrir } from '../../../../../../../lib/gestion/gestes';

/**
 * /api/admin/gestion/fils/[id]/sans-suite (lot 4b) — CLASSER SANS SUITE un échange, ou le ROUVRIR.
 *
 * POST classe (motif FACULTATIF : exiger une justification pour écarter une facture pour information ferait qu'on
 * n'écarterait plus rien). DELETE rouvre — l'échange revient dans la file. Rien n'est supprimé : le fil garde tous ses
 * messages, et un NOUVEAU message non exclu le ramène de lui-même dans la file (la capture s'en charge, et le journalise).
 *
 * 🔒 GARDE D'ÉCRITURE : `exigerCompteActif` relit la base à chaque appel. Deux barrières avec le proxy.
 * Runtime Node (driver pg).
 */
export const runtime = 'nodejs';

type Contexte = { params: Promise<{ id: string }> };

function filId(brut: string): number | null {
  const n = Number(brut);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function POST(request: Request, ctx: Contexte): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const id = filId((await ctx.params).id);
  if (id === null) return Response.json({ erreur: 'Échange inconnu.' }, { status: 400 });

  let motif: string | undefined;
  try { motif = ((await request.json()) as { motif?: string }).motif; }
  catch { motif = undefined; } // corps absent = classement sans motif : c'est permis, ce n'est pas une erreur

  try {
    const issue = await classerSansSuite(id, await auteurDeLaRequete(request), motif);
    if (!issue.ok) return Response.json({ erreur: issue.motif }, { status: 409 });
    return Response.json({ ok: true });
  } catch (e) {
    console.error('[gestion/sans-suite] classement impossible', e);
    return Response.json({ erreur: 'Classement impossible : erreur interne du serveur.' }, { status: 503 });
  }
}

export async function DELETE(request: Request, ctx: Contexte): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const id = filId((await ctx.params).id);
  if (id === null) return Response.json({ erreur: 'Échange inconnu.' }, { status: 400 });
  try {
    const issue = await rouvrir(id, await auteurDeLaRequete(request));
    if (!issue.ok) return Response.json({ erreur: issue.motif }, { status: 409 });
    return Response.json({ ok: true });
  } catch (e) {
    console.error('[gestion/sans-suite] réouverture impossible', e);
    return Response.json({ erreur: 'Réouverture impossible : erreur interne du serveur.' }, { status: 503 });
  }
}
