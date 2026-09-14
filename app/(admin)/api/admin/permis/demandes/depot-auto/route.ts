import 'server-only';
import { exigerAdministrateur } from '../../../../../../lib/admin/garde';
import { chargerConfigVeille } from '../../../../../../lib/sitadel/veilleConfig';
import { propositionsDepotTeleservice } from '../../../../../../lib/sitadel/demandeRepo';

/**
 * GET /api/admin/permis/demandes/depot-auto — AFFICHAGE AUTOMATIQUE du rail Téléservice : pour chaque commune LIBRE (pas de verrou
 * de référence vivant, cap mensuel non atteint, ≥ 1 permis éligible — tout ré-appliqué par `proposition`), la proposition de dépôt
 * (le premier lot). UNE par commune ; les communes ayant déjà une demande préparée sont exclues (leur carte est dans le carrousel).
 * LECTURE SEULE, AUCUN ENVOI. RÉSERVÉ ADMINISTRATEUR (proxy fail-closed + garde). Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    const cfg = await chargerConfigVeille();
    return Response.json({ propositions: await propositionsDepotTeleservice(cfg) });
  } catch {
    return Response.json({ erreur: 'propositions de dépôt indisponibles' }, { status: 503 });
  }
}
