import 'server-only';
import { exigerAdministrateur } from '../../../../../../lib/admin/garde';
import { chargerConfigVeille } from '../../../../../../lib/sitadel/veilleConfig';
import { compterVivierParProcess } from '../../../../../../lib/sitadel/demandeRepo';

/**
 * Lot 2 (carrousel Téléservice) — GET /api/admin/permis/demandes/vivier-compteur : nombre de PERMIS encore DEMANDABLES par
 * process (email / formulaire), DÉRIVÉ de `chargerVivier` (MÊME éligibilité que la recherche et le stock ; NI cap de candidats
 * NI plafond mensuel) → « stock restant », jamais la taille du prochain lot. `tronque` = décompte MINIMUM (plafond de chargement
 * atteint). RÉSERVÉ ADMINISTRATEUR (proxy fail-closed + garde). LECTURE SEULE. AUCUN ENVOI. Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    const cfg = await chargerConfigVeille();
    return Response.json(await compterVivierParProcess(cfg));
  } catch {
    return Response.json({ erreur: 'compteur de vivier indisponible' }, { status: 503 });
  }
}
