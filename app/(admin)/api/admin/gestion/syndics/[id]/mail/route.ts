import 'server-only';
import { exigerCompteActif } from '../../../../../../../lib/admin/garde';
import { preparerMailSyndic } from '../../../../../../../lib/gestion/mailSyndicRepo';
import { syndicsDisponibles } from '../../../../../../../lib/gestion/syndicRepo';

/**
 * ══ /api/admin/gestion/syndics/[id]/mail — LE MAIL AU SYNDIC, PRÉ-REMPLI (LOT MAIL-SYNDIC-PREREMPLI) ═══════════════
 *
 *   · GET `?a=adresse[&a=…][&lot=N]` → `{ etat: 'ok', objet, selection, corps }`.
 *     `lot` = le bien d'où l'on écrit : objet avec la résidence, corps complet. Sans `lot` (écran « Syndics ») :
 *     objet sans résidence, formule d'appel seule.
 *
 * 🔒 LECTURE SEULE : rien n'est écrit, rien n'est envoyé, aucun brouillon n'est créé. Droit `gestion`.
 * `private, no-store` : les données sont lues au moment du clic.
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

function identifiant(brut: string | null): number | null {
  const n = Number(brut ?? '');
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const id = identifiant((await params).id);
  if (id === null) return Response.json({ etat: 'erreur', message: 'Syndic non désigné.' }, { status: 422, headers: ENTETES });
  const url = new URL(request.url);
  const lot = identifiant(url.searchParams.get('lot'));
  const a = url.searchParams.getAll('a').map((x) => x.trim()).filter((x) => x !== '').slice(0, 50);
  try {
    if (!(await syndicsDisponibles())) {
      return Response.json({ etat: 'erreur', message: 'Annuaire des syndics non installé (migration 324).' },
        { status: 409, headers: ENTETES });
    }
    const pret = await preparerMailSyndic(id, lot, a);
    if (pret === null) return Response.json({ etat: 'erreur', message: 'Ce syndic n’existe pas.' }, { status: 404, headers: ENTETES });
    return Response.json({ etat: 'ok', ...pret }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/syndics/%d/mail] lecture impossible', id, e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' },
      { status: 503, headers: ENTETES });
  }
}
