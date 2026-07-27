import 'server-only';
import { exigerAdministrateur } from '../../../../../../lib/admin/garde';
import { chargerConfigVeille } from '../../../../../../lib/sitadel/veilleConfig';
import { proposition } from '../../../../../../lib/sitadel/demandeRepo';

/**
 * GET /api/admin/permis/demandes/proposition — LOTS PROPOSÉS (aucune écriture) pour revue avant création (chantier S7).
 * RÉSERVÉ ADMINISTRATEUR (proxy fail-closed + garde). LECTURE SEULE. AUCUN ENVOI. Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    return Response.json(await proposition(await chargerConfigVeille())); // { lots, diagnostic }
  } catch {
    return Response.json({ erreur: 'proposition indisponible' }, { status: 503 });
  }
}
