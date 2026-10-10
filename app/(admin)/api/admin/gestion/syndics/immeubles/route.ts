import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { immeublesConnus, syndicsDisponibles } from '../../../../../../lib/gestion/syndicRepo';

/**
 * ══ /api/admin/gestion/syndics/immeubles — LES IMMEUBLES CONNUS ET LEUR SYNDIC EN COURS ══════════════════════════
 *
 * Une seule lecture sert trois usages : le bouton de la carte d'un bien (« Coordonnées syndic » ou « Créer le
 * syndic »), l'auto-complétion « + Ajouter une copropriété », et la liste des biens montrée AVANT de confirmer.
 * Environ 230 immeubles et 365 lots : la réponse entière est petite, et l'écran la garde.
 *
 * 🔒 LECTURE SEULE. Droit `gestion`. `private, no-store`. Runtime Node (driver pg).
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  try {
    if (!(await syndicsDisponibles())) {
      return Response.json({ etat: 'ok', disponible: false, immeubles: [] }, { headers: ENTETES });
    }
    return Response.json({ etat: 'ok', disponible: true, immeubles: await immeublesConnus() }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/syndics/immeubles] lecture impossible', e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' },
      { status: 503, headers: ENTETES });
  }
}
