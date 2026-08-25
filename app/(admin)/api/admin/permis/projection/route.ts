import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { chargerConfigVeille } from '../../../../../lib/sitadel/veilleConfig';
import { listerFileProjection, validerProjection } from '../../../../../lib/permis/projectionFileRepo';

/**
 * PROJ-2c — /api/admin/permis/projection : FILE « Projection » (entre Réponses et Archives).
 * GET  → permis éligibles (documents obtenus + nature neuve/extension + projection non validée).
 * POST { action:'valider', dossierId } → valide la projection (condition serveur : chaque bâtiment tracé ou ignoré) ; le permis
 *        quitte la file et est marqué suivi (Rattachement « en attente d'une mise à jour »). Le tracé lui-même passe par /emprise.
 * RÉSERVÉ ADMINISTRATEUR. Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    return Response.json({ file: await listerFileProjection(await chargerConfigVeille()) });
  } catch (e) {
    console.error('[permis/projection] GET indisponible', e);
    return Response.json({ erreur: 'file de projection indisponible' }, { status: 503 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    const body = (await request.json().catch(() => ({}))) as { action?: string; dossierId?: number | string };
    const dossierId = typeof body.dossierId === 'number' ? body.dossierId : Number(body.dossierId);
    if (!Number.isInteger(dossierId) || dossierId <= 0) return Response.json({ erreur: 'requête invalide' }, { status: 400 });
    if (body.action !== 'valider') return Response.json({ erreur: 'action inconnue' }, { status: 400 });

    const res = await validerProjection(dossierId, 'admin:projection');
    if (!res.ok) return Response.json({ erreur: res.motif }, { status: 409 });
    return Response.json({ ok: true, marqueSuivi: res.marqueSuivi, file: await listerFileProjection(await chargerConfigVeille()) });
  } catch (e) {
    console.error('[permis/projection] POST indisponible', e);
    return Response.json({ erreur: 'action indisponible' }, { status: 503 });
  }
}
