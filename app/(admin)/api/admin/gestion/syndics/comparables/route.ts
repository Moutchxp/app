import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { syndicsComparables } from '../../../../../../lib/gestion/doublonSyndicRepo';
import { syndicsDisponibles } from '../../../../../../lib/gestion/syndicRepo';

/**
 * GET /api/admin/gestion/syndics/comparables — LOT SYNDIC-ANTI-DOUBLON-ET-PROPOSITION-PAR-ADRESSE.
 * L'annuaire des syndics tel que la comparaison anti-doublon le voit (nom, adresse, e-mails et téléphones du cabinet
 * et de ses contacts en poste) : la fenêtre de création compare PENDANT la saisie, sans attendre « Valider ».
 * 🔒 LECTURE SEULE. `private, no-store` : la réponse porte des coordonnées.
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  try {
    if (!(await syndicsDisponibles())) return Response.json({ etat: 'ok', syndics: [] }, { headers: ENTETES });
    return Response.json({ etat: 'ok', syndics: await syndicsComparables() }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/syndics/comparables] lecture impossible', e);
    return Response.json({ etat: 'erreur' }, { status: 503, headers: ENTETES });
  }
}
