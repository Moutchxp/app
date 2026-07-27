import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { lireReferentielCommunes } from '../../../../../lib/sitadel/carteRepo';

/**
 * GET /api/admin/permis/communes — RÉFÉRENTIEL léger (codes + noms + fusions) pour le multi-sélecteur de communes de la
 * tuile « Permis de construire » (chantier S6). Aucune géométrie (voir /carte). RÉSERVÉ ADMINISTRATEUR (proxy fail-closed
 * + `exigerAdministrateur`). LECTURE SEULE. Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    return Response.json(await lireReferentielCommunes());
  } catch {
    return Response.json({ erreur: 'référentiel communes indisponible' }, { status: 503 });
  }
}
