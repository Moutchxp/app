import 'server-only';
import { exigerInternaute } from '../../../lib/internaute/authGarde';
import { lireCoordonneesTunnel } from '../../../lib/internaute/coordonneesTunnel';

// Runtime Node explicite (driver pg via la garde). Route PUBLIQUE (hors matcher admin), LECTURE SEULE.
export const runtime = 'nodejs';

/**
 * GET /api/internaute/coordonnees — coordonnées déjà connues de l'internaute CONNECTÉ, pour ne pas les lui redemander à
 * la demande de certificat (lot COORDONNEES-CONNU, 16/10/2026).
 *
 * SÉCURITÉ : `exigerInternaute` ; toutes les lectures sont scopées par l'id SCELLÉ dans la session (jamais lu dans la
 * requête). Non connecté → 200 `{ connecte: false }` (comme /api/internaute/session : pas de 401 dans la console d'un
 * visiteur anonyme). Erreur → `{ connecte: false }` (fail-closed : le formulaire complet s'affiche, comme aujourd'hui).
 * Aucune écriture. `Cache-Control: no-store`.
 */
export async function GET(request: Request): Promise<Response> {
  const entetes = { 'Cache-Control': 'no-store' };
  try {
    const garde = await exigerInternaute(request);
    if ('refus' in garde) return Response.json({ connecte: false }, { headers: entetes });
    const c = await lireCoordonneesTunnel(garde.internauteId);
    return Response.json({ connecte: true, ...c }, { headers: entetes });
  } catch {
    return Response.json({ connecte: false }, { headers: entetes });
  }
}
