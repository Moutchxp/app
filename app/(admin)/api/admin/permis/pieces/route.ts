import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { listerPiecesDossier } from '../../../../../lib/sitadel/demandeRepo';

/**
 * EXT-1 (point 5) — /api/admin/permis/pieces?dossierId=… : LISTE des pièces d'un permis (MÊME source qu'Archives,
 * `listerPiecesDossier`). Sert à afficher les pièces EN DERNIÈRE POSITION de la ligne dépliée d'« Analyse et projection »
 * (référence en regard de la saisie), séparément de l'éditeur de caractéristiques. LECTURE SEULE. RÉSERVÉ ADMINISTRATEUR. Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  const dossierId = Number(new URL(request.url).searchParams.get('dossierId'));
  if (!Number.isInteger(dossierId) || dossierId <= 0) return Response.json({ erreur: 'dossierId invalide' }, { status: 400 });
  try {
    return Response.json({ pieces: await listerPiecesDossier(dossierId) });
  } catch (e) {
    console.error('[permis/pieces] GET indisponible', e);
    return Response.json({ erreur: 'pièces indisponibles' }, { status: 503 });
  }
}
