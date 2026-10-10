import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { adressesBanLocale, syndicsDisponibles } from '../../../../../../lib/gestion/syndicRepo';

/**
 * ══ /api/admin/gestion/syndics/adresses?q=… — LOT FICHE-SYNDIC-FINITIONS ══════════════════════════════════════════
 *
 * Les adresses HORS PORTEFEUILLE proposées à « + Ajouter une copropriété » : lues dans la Base Adresse Nationale
 * LOCALE (`adresse_ban`, base PostgreSQL de l'application). 🔴 AUCUN SERVICE EN LIGNE N'EST APPELÉ.
 * Les immeubles du portefeuille, eux, viennent de `/syndics/immeubles`, déjà gardé par l'écran.
 *
 * 🔒 LECTURE SEULE. Droit `gestion`. `private, no-store`. Runtime Node (driver pg).
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const q = (new URL(request.url).searchParams.get('q') ?? '').slice(0, 200);
  try {
    if (!(await syndicsDisponibles())) return Response.json({ etat: 'ok', adresses: [] }, { headers: ENTETES });
    return Response.json({ etat: 'ok', adresses: await adressesBanLocale(q) }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/syndics/adresses] lecture impossible', e);
    return Response.json({ etat: 'erreur', adresses: [] }, { status: 503, headers: ENTETES });
  }
}
