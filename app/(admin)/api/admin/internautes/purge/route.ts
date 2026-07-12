import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { purgerEchus } from '../../../../../lib/internaute/cycleVie';

/**
 * POST /api/admin/internautes/purge — PURGE À ÉCHÉANCE (déclenchable manuellement, module Internaute LOT 4).
 *
 * Anonymise (RÈGLE ASYMÉTRIQUE : A+C purgés, preuve B conservée) les profils dont la rétention identité+projet est
 * DÉPASSÉE ET qui n'ont AUCUNE finalité active. Durées PARAMÉTRABLES (`internaute_retention`, valeurs PROVISOIRES à
 * fixer avec le DPO). Chaque purge journalisée (`purge_auto`). RÉSERVÉ RÔLE ADMINISTRATEUR + fail-closed proxy.
 * Déclenchement MANUEL (pas de cron dans ce lot). Aucun pont M2, golden intact. Runtime Node.
 */
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  try {
    const garde = await exigerAdministrateur(request);
    if ('refus' in garde) return garde.refus;

    const { purges } = await purgerEchus(garde.auteurId);
    return Response.json({ ok: true, purges });
  } catch {
    return Response.json({ erreur: 'purge indisponible' }, { status: 503 });
  }
}
