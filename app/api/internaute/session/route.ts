import 'server-only';
import { exigerInternaute } from '../../../lib/internaute/authGarde';

// Runtime Node explicite (driver pg via la garde). Route PUBLIQUE (hors matcher admin).
export const runtime = 'nodejs';

/**
 * GET /api/internaute/session — ÉTAT de session, pour l'UI (ex. afficher « Se déconnecter »). Réponse MINIMALE et
 * NON NOMINATIVE : un seul booléen `{ connecte }`, JAMAIS d'id, e-mail ou prénom.
 *
 * TOUJOURS 200 (jamais 401/500) : un 401 dans la console d'un visiteur anonyme est du bruit inutile. On réutilise
 * `exigerInternaute` (aucune logique de session dupliquée) : refus → `connecte:false`, succès → `connecte:true`.
 * FAIL-CLOSED : toute erreur (panne DB, garde qui lève) → `connecte:false` (dans le doute, on n'affiche pas la
 * déconnexion). `Cache-Control: no-store` (l'état de session ne se met jamais en cache).
 */
export async function GET(request: Request): Promise<Response> {
  let connecte = false;
  try {
    const garde = await exigerInternaute(request);
    connecte = !('refus' in garde);
  } catch {
    connecte = false; // fail-closed
  }
  return Response.json({ connecte }, { headers: { 'Cache-Control': 'no-store' } });
}
