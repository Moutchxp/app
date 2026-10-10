import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { contactsDeLImmeuble } from '../../../../../../lib/gestion/contactsImmeubleRepo';

/**
 * ══ /api/admin/gestion/coproprietes/contacts — LOT COPRO-CONTACTS-IMMEUBLE ════════════════════════════════════════
 *
 *   · GET ?immeuble=<libellé> les contacts PROPRES à cet immeuble (gardien, conseil syndical, personnalisé), en cours,
 *         avec leurs coordonnées. 🔒 LECTURE SEULE. L'écriture passe par la fiche (`enregistrerSyndic`), comme le reste.
 *
 * 🔒 Droit `gestion`. `private, no-store`. Runtime Node (driver pg).
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const immeuble = (new URL(request.url).searchParams.get('immeuble') ?? '').trim();
  if (immeuble === '') return Response.json({ etat: 'erreur', message: 'Immeuble non désigné.' }, { status: 422, headers: ENTETES });
  try {
    return Response.json({ etat: 'ok', contacts: await contactsDeLImmeuble(immeuble) }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/coproprietes/contacts] lecture impossible', e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' }, { status: 503, headers: ENTETES });
  }
}
