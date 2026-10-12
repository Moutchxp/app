import 'server-only';
import { exigerCompteActif } from '../../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../../lib/gestion/auteur';
import { ignorerProposition, propositionPourBien } from '../../../../../../../lib/gestion/doublonSyndicRepo';
import { syndicsDisponibles } from '../../../../../../../lib/gestion/syndicRepo';

/**
 * /api/admin/gestion/biens/[id]/syndic-connu — LOT SYNDIC-ANTI-DOUBLON-ET-PROPOSITION-PAR-ADRESSE, PARTIE 3.
 *   · GET  : le bandeau « Syndic connu pour cette adresse » de la fiche du bien (`proposition: null` s'il n'y en a pas).
 *            🔒 LECTURE SEULE.
 *   · POST `{ syndicId }` : « Ignorer », mémorisé pour ce bien au journal (ajout seul). Écrit UNIQUEMENT sur ce clic.
 * Le « Rattacher » du bandeau passe par `/syndics/[id]/rattacher-bien`, la même porte que les autres rattachements.
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

async function lotDe(params: Promise<{ id: string }>): Promise<number | null> {
  const n = Number((await params).id);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const lot = await lotDe(params);
  if (lot === null) return Response.json({ etat: 'ok', proposition: null }, { headers: ENTETES });
  try {
    if (!(await syndicsDisponibles())) return Response.json({ etat: 'ok', proposition: null }, { headers: ENTETES });
    return Response.json({ etat: 'ok', proposition: await propositionPourBien(lot) }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/biens/%d/syndic-connu] lecture impossible', lot, e);
    return Response.json({ etat: 'erreur' }, { status: 503, headers: ENTETES });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const lot = await lotDe(params);
  if (lot === null) return Response.json({ erreur: 'Bien non désigné.' }, { status: 422, headers: ENTETES });
  let corps: Record<string, unknown>;
  try { corps = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ erreur: 'Requête invalide.' }, { status: 422, headers: ENTETES }); }
  const syndicId = Number(corps?.syndicId);
  if (!Number.isSafeInteger(syndicId) || syndicId <= 0) return Response.json({ erreur: 'Syndic non désigné.' }, { status: 422, headers: ENTETES });
  try {
    const issue = await ignorerProposition(lot, syndicId, await auteurDeLaRequete(request));
    if (!issue.ok) return Response.json({ erreur: issue.motif }, { status: 404, headers: ENTETES });
    return Response.json({ ok: true }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/biens/%d/syndic-connu] « Ignorer » impossible', lot, e);
    return Response.json({ erreur: 'Enregistrement impossible : la base n’a pas répondu.' }, { status: 503, headers: ENTETES });
  }
}
