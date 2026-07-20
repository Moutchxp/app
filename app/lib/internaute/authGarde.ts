import 'server-only';
import { query } from '../db/client';
import { NOM_COOKIE_CLIENT, verifierSession } from './authSession';

/**
 * GARDE des routes INTERNAUTE authentifiées. TOTALEMENT SÉPARÉE de l'admin — cookie/secret dédiés, et JAMAIS placée
 * dans `proxy.ts`/`garde.ts` admin (dont le matcher `/admin`, `/api/admin/*` ne voit pas les routes internaute).
 * Calquée sur `exigerAdministrateur` : lit `svv_client_session` → vérifie le JWS → RELIT LA BASE (l'internaute doit
 * exister ET NE PAS être effacé). Un internaute anonymisé/effacé n'a JAMAIS de session valide (sinon le jeton apatride
 * survivrait ≤ TTL).
 */

/** Extrait la valeur d'un cookie du header `Cookie` brut (sans `next/headers` → testable). Calqué sur admin/garde.ts. */
function lireCookie(request: Request, nom: string): string | null {
  const brut = request.headers.get('cookie');
  if (!brut) return null;
  for (const part of brut.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === nom) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

/** Réponse 401 générique (aucune cause → pas de fuite). */
function refus401(): Response {
  return Response.json({ erreur: 'non authentifié' }, { status: 401 });
}

/** Résultat : soit un refus à retourner tel quel, soit l'`internauteId` authentifié. */
export type GardeInternaute = { refus: Response } | { internauteId: string };

/**
 * Exige une session internaute valide. Renvoie `{ internauteId }` ou `{ refus }` (401). Lecture seule, une requête ;
 * aucune requête base si le cookie est absent/invalide (court-circuit).
 */
export async function exigerInternaute(request: Request): Promise<GardeInternaute> {
  const jeton = lireCookie(request, NOM_COOKIE_CLIENT);
  const internauteId = jeton ? await verifierSession(jeton) : null;
  if (!internauteId) return { refus: refus401() };
  const r = await query(`SELECT 1 FROM internaute WHERE id = $1 AND efface_a IS NULL`, [internauteId]);
  if (r.rows.length === 0) return { refus: refus401() }; // inexistant OU effacé → jamais de session valide
  return { internauteId };
}
