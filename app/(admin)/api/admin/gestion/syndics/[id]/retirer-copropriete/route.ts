import 'server-only';
import { exigerCompteActif } from '../../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../../lib/gestion/auteur';
import { retirerDeLaCopropriete, syndicsDisponibles } from '../../../../../../../lib/gestion/syndicRepo';

/**
 * ══ /api/admin/gestion/syndics/[id]/retirer-copropriete — LOT SYNDIC-RETIRER-DE-LA-RESIDENCE ═════════════════════
 *
 *   · POST { immeuble } « Supprimer ce syndic de cette résidence » : le lien de CETTE copropriété est fermé, les
 *          affectations de ses contacts à elle retirées, une ligne de journal par lot. Le syndic, ses autres
 *          copropriétés et son catalogue sont conservés ; rien n'est effacé (`retirerDeLaCopropriete`).
 *
 * 🔒 Droit `gestion` ; l'auteur vient de la SESSION. `private, no-store`. Runtime Node (driver pg).
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ erreur: 'Syndic non désigné.' }, { status: 422, headers: ENTETES });
  let corps: unknown;
  try { corps = await request.json(); }
  catch { return Response.json({ erreur: 'Requête invalide.' }, { status: 422, headers: ENTETES }); }
  const immeuble = typeof (corps as { immeuble?: unknown } | null)?.immeuble === 'string' ? (corps as { immeuble: string }).immeuble : '';
  if (immeuble.trim() === '') return Response.json({ erreur: 'Copropriété non désignée.' }, { status: 422, headers: ENTETES });
  try {
    if (!(await syndicsDisponibles())) {
      return Response.json({ erreur: 'Annuaire des syndics non installé (migration 324).' }, { status: 409, headers: ENTETES });
    }
    const issue = await retirerDeLaCopropriete(id, immeuble, await auteurDeLaRequete(request));
    if (!issue.ok) return Response.json({ erreur: issue.motif }, { status: 404, headers: ENTETES });
    return Response.json({ ok: true, lots: issue.lots }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/syndics/%d/retirer-copropriete] retrait impossible', id, e);
    return Response.json({ erreur: 'Retrait impossible : la base n’a pas répondu.' }, { status: 503, headers: ENTETES });
  }
}
