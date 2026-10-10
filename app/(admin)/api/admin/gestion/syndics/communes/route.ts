import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { communesDuCodePostal, syndicsDisponibles } from '../../../../../../lib/gestion/syndicRepo';

/**
 * ══ /api/admin/gestion/syndics/communes?cp=92400 — LOT FICHE-SYNDIC-COORDONNEES-ET-ENTETE ═════════════════════════
 *
 * La ville proposée quand on tape le code postal du syndic. Lue dans ce que l'application connaît déjà (Paris, nos
 * lots, l'annuaire DILA importé) — 🔴 AUCUN SERVICE EN LIGNE. Voir `communesDuCodePostal`.
 *
 * 🔒 LECTURE SEULE. Droit `gestion`. `private, no-store`. Runtime Node (driver pg).
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const cp = (new URL(request.url).searchParams.get('cp') ?? '').slice(0, 10);
  try {
    if (!(await syndicsDisponibles())) return Response.json({ etat: 'ok', communes: [] }, { headers: ENTETES });
    return Response.json({ etat: 'ok', communes: await communesDuCodePostal(cp) }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/syndics/communes] lecture impossible', e);
    return Response.json({ etat: 'erreur', communes: [] }, { status: 503, headers: ENTETES });
  }
}
