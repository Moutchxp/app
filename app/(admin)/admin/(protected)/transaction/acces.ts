import 'server-only';
import { cookies } from 'next/headers';
import { NOM_COOKIE, verifierJeton, sessionDepuisPayload } from '../../../../lib/admin/session';

/**
 * TUILE TRANSACTION — qui entre dans ses pages. `proxy.ts` refuse déjà `/admin/transaction/*` sans le droit ; ce garde SERVEUR aligne
 * chaque page : un non-autorisé voit un avis, jamais une donnée. Les données passent par `/api/admin/transaction`, gardée elle aussi
 * (droit relu en base).
 */
export async function accesTransaction(): Promise<{ autorise: boolean }> {
  const jeton = (await cookies()).get(NOM_COOKIE)?.value;
  const payload = jeton ? await verifierJeton(jeton) : null;
  const session = payload ? sessionDepuisPayload(payload) : null;
  return { autorise: session?.perms.transaction === true };
}

export const REFUS_TRANSACTION = 'Cet espace est réservé aux comptes disposant du droit « Transaction ».';
