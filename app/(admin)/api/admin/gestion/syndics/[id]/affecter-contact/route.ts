import 'server-only';
import { exigerCompteActif } from '../../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../../lib/gestion/auteur';
import { affecterContact } from '../../../../../../../lib/gestion/doublonSyndicRepo';
import { syndicsDisponibles } from '../../../../../../../lib/gestion/syndicRepo';

/**
 * POST /api/admin/gestion/syndics/[id]/affecter-contact — LOT FICHE-SYNDIC-UNIQUE-ET-PARTAGEE.
 * Corps : `{ contactId: number, copro: string }`. « Ajouter » un contact syndic DÉJÀ CONNU chez ce cabinet à une
 * copropriété : la personne existante suit aussi cette copropriété (un lien de plus, jamais une copie). Par la porte
 * unique `enregistrerSyndic`. 🔴 ÉCRIT UNIQUEMENT SUR CE CLIC.
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ erreur: 'Syndic non désigné.' }, { status: 422, headers: ENTETES });
  let corps: Record<string, unknown>;
  try { corps = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ erreur: 'Requête invalide.' }, { status: 422, headers: ENTETES }); }
  const contactId = Number(corps?.contactId);
  const copro = typeof corps?.copro === 'string' ? corps.copro.trim().slice(0, 300) : '';
  if (!Number.isSafeInteger(contactId) || contactId <= 0 || copro === '') {
    return Response.json({ erreur: 'Contact ou copropriété non désigné.' }, { status: 422, headers: ENTETES });
  }
  try {
    if (!(await syndicsDisponibles())) {
      return Response.json({ erreur: 'Annuaire des syndics non installé (migration 324).' }, { status: 409, headers: ENTETES });
    }
    const issue = await affecterContact(id, contactId, copro, await auteurDeLaRequete(request));
    if (!issue.ok) return Response.json({ erreur: issue.motif }, { status: 409, headers: ENTETES });
    return Response.json({ ok: true }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/syndics/%d/affecter-contact] affectation impossible', id, e);
    return Response.json({ erreur: 'Affectation impossible : la base n’a pas répondu.' }, { status: 503, headers: ENTETES });
  }
}
