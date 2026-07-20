import 'server-only';
import { cookies } from 'next/headers';
import { NOM_COOKIE_CLIENT } from './authSession';
import { exigerInternaute } from './authGarde';

/**
 * Garde de PAGE de l'espace client (Commit C). Les composants serveur n'ont pas de `Request` : on lit le cookie de
 * session (`svv_client_session`) via `next/headers`, puis on réutilise EXACTEMENT la garde des routes (`exigerInternaute` :
 * JWS vérifié + RELECTURE base « existe ET efface_a IS NULL ») — AUCUNE duplication du contrôle de sécurité. On synthétise
 * un `Request` porteur du seul cookie de session pour franchir ce pont. Renvoie l'`internauteId` connecté, ou `null`
 * (session absente / invalide / dossier effacé) → la page REDIRIGE alors vers la connexion, sans rien divulguer.
 */
export async function internauteConnecteDepuisCookies(): Promise<string | null> {
  const valeur = (await cookies()).get(NOM_COOKIE_CLIENT)?.value ?? '';
  const requete = new Request('http://svv.local/espace', {
    headers: { cookie: `${NOM_COOKIE_CLIENT}=${encodeURIComponent(valeur)}` },
  });
  const garde = await exigerInternaute(requete);
  return 'refus' in garde ? null : garde.internauteId;
}
