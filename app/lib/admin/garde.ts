import 'server-only';
import { cookies } from 'next/headers';
import { NOM_COOKIE, verifierJeton, sessionDepuisPayload, type Module } from './session';

/**
 * Defense in depth (M3 Lot 2e). `proxy.ts` reste la garde PRINCIPALE (il refuse déjà l'accès sans la
 * permission), mais une route peut vérifier une SECONDE fois côté serveur, au cas où le matcher du proxy
 * changerait. Renvoie `true` si la session courante porte la permission `module`, `false` sinon (cookie
 * absent/invalide/expiré, ou collaborateur sans la permission). Un administrateur a toujours `true`
 * (permissions implicites, cf. sessionDepuisPayload).
 */
export async function aLaPermission(module: Module): Promise<boolean> {
  const jeton = (await cookies()).get(NOM_COOKIE)?.value;
  const payload = jeton ? await verifierJeton(jeton) : null;
  if (!payload) return false;
  return sessionDepuisPayload(payload).perms[module];
}
