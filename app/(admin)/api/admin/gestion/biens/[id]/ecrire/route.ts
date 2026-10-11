import 'server-only';
import { exigerCompteActif } from '../../../../../../../lib/admin/garde';
import { ecrireDepuisLeBien } from '../../../../../../../lib/gestion/suggestionsBienRepo';

/**
 * ══ /api/admin/gestion/biens/[id]/ecrire — ÉCRIRE DEPUIS LA FICHE D'UN BIEN (LOT MAIL-DEPUIS-BIEN-RATTACHEMENT-ET-SUGGESTIONS)
 *
 *   · GET → `{ etat: 'ok', cible, groupes }` : le bien d'origine à pré-cocher dans le classement, et les adresses
 *     liées au bien en trois groupes (clients, immeuble, autres) pour les champs À / Cc / Cci.
 *
 * 🔒 LECTURE SEULE : rien n'est écrit, rien n'est envoyé. Droit `gestion`. `private, no-store`. `[id]` = l'identifiant
 * interne du lot (`gestion_annuaire_lot.id`), celui que la fiche connaît.
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const n = Number((await params).id);
  if (!Number.isSafeInteger(n) || n <= 0) {
    return Response.json({ etat: 'erreur', message: 'Bien non désigné.' }, { status: 422, headers: ENTETES });
  }
  try {
    const lu = await ecrireDepuisLeBien(n);
    if (lu === null) return Response.json({ etat: 'erreur', message: 'Ce bien n’existe pas.' }, { status: 404, headers: ENTETES });
    return Response.json({ etat: 'ok', ...lu }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/biens/%d/ecrire] lecture impossible', n, e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' },
      { status: 503, headers: ENTETES });
  }
}
