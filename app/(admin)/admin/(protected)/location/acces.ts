import 'server-only';
import { cookies } from 'next/headers';
import { NOM_COOKIE, verifierJeton, sessionDepuisPayload } from '../../../../lib/admin/session';

/**
 * TUILE LOCATION — qui entre dans ses pages. `proxy.ts` refuse déjà `/admin/location/*` sans le droit ; ce garde SERVEUR
 * aligne chaque page : un non-autorisé voit un avis, jamais une donnée. Les données passent par `/api/admin/location`,
 * gardée elle aussi (droit relu en base).
 */
export async function accesLocation(): Promise<{ autorise: boolean; administrateur: boolean }> {
  const jeton = (await cookies()).get(NOM_COOKIE)?.value;
  const payload = jeton ? await verifierJeton(jeton) : null;
  const session = payload ? sessionDepuisPayload(payload) : null;
  return { autorise: session?.perms.location === true, administrateur: session?.role === 'administrateur' };
}

/** Un identifiant lu dans l'adresse. `null` si ce n'est pas un entier positif. */
export function identifiantPage(brut: string | undefined): number | null {
  if (brut === undefined || !/^[1-9]\d{0,15}$/.test(brut)) return null;
  const n = Number(brut);
  return Number.isSafeInteger(n) ? n : null;
}

export const REFUS_LOCATION = 'Cet espace est réservé aux comptes disposant du droit « Location ».';
