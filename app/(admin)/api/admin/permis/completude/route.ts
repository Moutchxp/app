import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { lireCompletude } from '../../../../../lib/permis/completudeRepo';

/**
 * PART-2 — /api/admin/permis/completude?dossierId=… : DIAGNOSTIC DE COMPLÉTUDE mémorisé d'un permis (présent/manquant par famille),
 * recomposé selon les familles attendues VIVES, SANS relire les PDF. `null` = jamais analysé (ou migration 174 absente) → le client
 * proposera « Relancer l'analyse ». LECTURE SEULE. RÉSERVÉ ADMINISTRATEUR. Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  const dossierId = Number(new URL(request.url).searchParams.get('dossierId'));
  if (!Number.isInteger(dossierId) || dossierId <= 0) return Response.json({ erreur: 'dossierId invalide' }, { status: 400 });
  try {
    return Response.json({ completude: await lireCompletude(dossierId) }); // null si jamais analysé
  } catch (e) {
    console.error('[permis/completude] GET indisponible', e);
    return Response.json({ erreur: 'diagnostic indisponible' }, { status: 503 });
  }
}
