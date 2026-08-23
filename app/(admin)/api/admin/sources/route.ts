import 'server-only';
import { exigerAdministrateur } from '../../../../lib/admin/garde';
import { lireSourcesFraicheur } from '../../../../lib/admin/sourcesFraicheurRepo';
import { construireEtatSources, DEPARTEMENTS } from '../../../../lib/admin/sourcesFraicheur';

/**
 * GET /api/admin/sources — FRAÎCHEUR DES DONNÉES (lot 1/3, LECTURE SEULE).
 *
 * Assemble l'état de fraîcheur des 8 sources qui font vivre l'outil : millésime en base, âge calculé, surveillance,
 * mode de ré-ingestion, couverture par département. STRICTEMENT en lecture (aucun téléchargement, aucune détection
 * distante, aucune ingestion : lots 2 et 3). RÉSERVÉ ADMINISTRATEUR (`exigerAdministrateur`, comme Audit/Permis).
 * L'âge est calculé au moment de la requête (`new Date()`), jamais figé. Seul GET exporté. Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    const garde = await exigerAdministrateur(request);
    if ('refus' in garde) return garde.refus; // 403 générique

    const lectures = await lireSourcesFraicheur();
    const lignes = construireEtatSources(lectures, new Date());
    return Response.json({ lignes, departements: DEPARTEMENTS });
  } catch (e) {
    console.error('[admin/sources] indisponible', e);
    return Response.json({ erreur: 'sources indisponibles' }, { status: 503 });
  }
}
