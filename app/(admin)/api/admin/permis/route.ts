import 'server-only';
import { exigerAdministrateur } from '../../../../lib/admin/garde';
import { lireFiltres, lirePagination } from '../../../../lib/sitadel/priorite';
import { chargerConfigVeille } from '../../../../lib/sitadel/veilleConfig';
import { lireVeille } from '../../../../lib/sitadel/veilleRepo';

/**
 * GET /api/admin/permis — LISTE FILTRÉE paginée de la veille « Permis de construire » (chantier S3, LECTURE SEULE).
 *
 * PERMISSION : réservé au RÔLE ADMINISTRATEUR (`exigerAdministrateur`, relit role+actif en base). La route n'est PAS
 * déclarée dans `proxy.ts` → le défaut FAIL-CLOSED du proxy la réserve déjà à l'administrateur (les collaborateurs sont
 * refusés) ; ce garde est la seconde barrière (défense en profondeur, comme /api/admin/internautes et /api/admin/audit).
 *
 * Filtres + pagination lus des query params (`lireFiltres`/`lirePagination`), classement et seuils depuis `config_veille`
 * (repli sûr). Aucune écriture ; aucun contact moteur/score/certificat. Seul GET. Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  try {
    const garde = await exigerAdministrateur(request);
    if ('refus' in garde) return garde.refus;

    const url = new URL(request.url);
    const filtres = lireFiltres(url.searchParams);
    const { page, taille } = lirePagination(url.searchParams);
    const config = await chargerConfigVeille();
    const resultat = await lireVeille(filtres, config, page, taille);
    return Response.json(resultat);
  } catch {
    return Response.json({ erreur: 'veille permis indisponible' }, { status: 503 });
  }
}
