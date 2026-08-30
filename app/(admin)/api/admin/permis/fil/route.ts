import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { lireFilPermis } from '../../../../../lib/permis/filPermisRepo';

/**
 * FIL-A — /api/admin/permis/fil?dossierId=… : historique des échanges e-mail d'un permis (LECTURE SEULE). Renvoie { statut } où
 * statut = 'multi' (demande multi-dossiers → pas de fil attribuable), 'vide' (aucun échange), ou 'ok' avec les entrées décroissantes.
 * RÉSERVÉ ADMINISTRATEUR. Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  const dossierId = Number(new URL(request.url).searchParams.get('dossierId'));
  if (!Number.isInteger(dossierId) || dossierId <= 0) return Response.json({ erreur: 'dossierId invalide' }, { status: 400 });
  try {
    return Response.json(await lireFilPermis(dossierId));
  } catch (e) {
    console.error('[permis/fil] GET indisponible', e);
    return Response.json({ erreur: 'fil indisponible' }, { status: 503 });
  }
}
