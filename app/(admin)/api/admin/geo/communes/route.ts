import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { refCommunes } from '../../../../../lib/analytics/lecture/geo';

/**
 * M2 — LOT 6. GET /api/admin/geo/communes → référentiel cartographique { [insee]: { nom, centroid:[lon,lat] } }.
 *
 * PURE GÉO (aucun compteur, aucune donnée de trafic) → HORS k-anonymat : c'est un fond de carte (centroïdes
 * de communes, données publiques), pas une ventilation de population. Renvoie TOUJOURS le périmètre complet,
 * indépendamment du trafic → ne peut rien divulguer sur les tests.
 *
 * PERMISSION IDENTIQUE à /api/admin/statistiques : `perm_statistiques`, vérifiée CÔTÉ SERVEUR par
 * `exigerCompteActif` (relit actif + perm → révocation immédiate). Seul GET exporté. Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    const refus = await exigerCompteActif(request, 'statistiques');
    if (refus) return refus;
    return Response.json(await refCommunes());
  } catch {
    // Dérivation géo en échec (base) → erreur maîtrisée, jamais de fuite de détail.
    return Response.json({ erreur: 'référentiel communes indisponible' }, { status: 503 });
  }
}
