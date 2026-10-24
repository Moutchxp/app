import 'server-only';
import { demanderReinitialisation } from '../../../../../lib/admin/reinitialisationRepo';
import { MESSAGE_DEMANDE } from '../../../../../lib/admin/reinitialisation';

/**
 * « MOT DE PASSE OUBLIÉ » DE L'ADMINISTRATION — LA DEMANDE (Arno, 24/10/2026, migration 416). PUBLIQUE (whitelist du proxy).
 * POST { email } → TOUJOURS la même réponse (200, `MESSAGE_DEMANDE`) : compte connu, inconnu, désactivé, rafale, corps invalide,
 * panne — rien ne permet de savoir si l'adresse a un compte. L'envoi du mail n'est PAS attendu (le temps de réponse ne dépend pas
 * de son existence). Aucune adresse ni jeton journalisé ici.
 */
export const runtime = 'nodejs';

const reponse = (): Response => Response.json({ message: MESSAGE_DEMANDE }, { status: 200, headers: { 'Cache-Control': 'private, no-store' } });

export async function POST(request: Request): Promise<Response> {
  const b = (await request.json().catch(() => ({}))) as { email?: unknown };
  try {
    await demanderReinitialisation(b?.email);
  } catch {
    /* une panne ne change pas la réponse (aucune fuite) */
  }
  return reponse();
}
