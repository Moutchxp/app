import 'server-only';
import { exigerAdministrateur } from '../../../../lib/admin/garde';
import { lireSourcesFraicheur } from '../../../../lib/admin/sourcesFraicheurRepo';
import { construireEtatSources, DEPARTEMENTS } from '../../../../lib/admin/sourcesFraicheur';
import { lireDetections, basculerDetectionSource } from '../../../../lib/veille/detectionRepo';

/**
 * /api/admin/sources — FRAÎCHEUR DES DONNÉES.
 * GET  → état des 8 sources (lot 1 : millésime, âge, couverture) + détection d'édition plus récente (lot 2).
 * POST { action: 'reglage_detection', source, actif } → active/désactive la surveillance d'UNE source (réglage, pas une action
 *        d'ingestion). Aucun bouton ne déclenche de téléchargement (lot 3).
 *
 * STRICTEMENT métadonnées : la détection interroge des index/en-têtes, jamais la donnée. RÉSERVÉ ADMINISTRATEUR
 * (`exigerAdministrateur`, comme Audit/Permis). L'âge est calculé au moment de la requête (`new Date()`). Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    const garde = await exigerAdministrateur(request);
    if ('refus' in garde) return garde.refus; // 403 générique

    const [lectures, detections] = await Promise.all([lireSourcesFraicheur(), lireDetections()]);
    const lignes = construireEtatSources(lectures, new Date(), detections);
    return Response.json({ lignes, departements: DEPARTEMENTS });
  } catch (e) {
    console.error('[admin/sources] GET indisponible', e);
    return Response.json({ erreur: 'sources indisponibles' }, { status: 503 });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const garde = await exigerAdministrateur(request);
    if ('refus' in garde) return garde.refus;

    const body = (await request.json().catch(() => ({}))) as { action?: string; source?: string; actif?: boolean };
    if (body.action !== 'reglage_detection' || typeof body.source !== 'string' || typeof body.actif !== 'boolean') {
      return Response.json({ erreur: 'requête invalide' }, { status: 400 });
    }
    try {
      const actif = await basculerDetectionSource(body.source, body.actif);
      return Response.json({ ok: true, source: body.source, actif });
    } catch (e) {
      // Source inconnue / non détectable → 400 (pas une 503 : la requête est en cause).
      return Response.json({ erreur: e instanceof Error ? e.message : 'source invalide' }, { status: 400 });
    }
  } catch (e) {
    console.error('[admin/sources] POST indisponible', e);
    return Response.json({ erreur: 'réglage indisponible' }, { status: 503 });
  }
}
