import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { lireCarteCommunes } from '../../../../../lib/sitadel/carteRepo';

/**
 * GET /api/admin/permis/carte — GÉOMÉTRIES des communes (Lambert-93, simplifiées en couverture) + bbox, pour la carte
 * SVG de sélection (chantier S6). AUCUN fond de plan, AUCUNE tuile externe : on ne sert que nos polygones (pas de
 * dépendance ni d'attribution supplémentaire). Chargé à l'OUVERTURE de la carte (une seule charge utile). RÉSERVÉ
 * ADMINISTRATEUR (proxy fail-closed + `exigerAdministrateur`). LECTURE SEULE. Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    return Response.json(await lireCarteCommunes());
  } catch {
    return Response.json({ erreur: 'carte communes indisponible' }, { status: 503 });
  }
}
