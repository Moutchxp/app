import 'server-only';
import { query } from '../db/client';
import { NOM_COOKIE_CLIENT, verifierSessionDetail } from './authSession';

/**
 * GARDE des routes INTERNAUTE authentifiées. TOTALEMENT SÉPARÉE de l'admin — cookie/secret dédiés, et JAMAIS placée
 * dans `proxy.ts`/`garde.ts` admin (dont le matcher `/admin`, `/api/admin/*` ne voit pas les routes internaute).
 *
 * Lit `svv_client_session` → vérifie le JWS (`verifierSessionDetail` → `{sub, cev}`) → RELIT LA BASE en fusionnant TROIS
 * conditions dans UNE requête (aucun round-trip ajouté) : l'internaute existe, n'est PAS effacé, ET sa session n'est pas
 * ANTÉRIEURE au dernier changement de mot de passe (`a.maj_a <= cev`). Ce dernier point (F2 « enforcement ») RÉVOQUE les
 * sessions ouvertes avant un reset : au reset, `poserMotDePasse` avance `maj_a` et la nouvelle session scelle ce `maj_a`
 * (F1) → elle survit, les autres non. FAIL-CLOSED : toute erreur (panne DB) → refus 401 propre (reconnexion), jamais 500.
 * ⚠️ Un jeton émis AVANT F1 n'a pas de `cev` (→ `NULL`) → `a.maj_a <= NULL` = NULL → 0 ligne → refusé (déconnexion voulue).
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
  const detail = jeton ? await verifierSessionDetail(jeton) : null;
  if (!detail) return { refus: refus401() }; // pas de cookie / JWS invalide / exp / sub vide
  try {
    // Existence + non-effacé + session PAS antérieure au dernier credential (`a.maj_a <= cev`, précision fine F1).
    // `cev` NULL (jeton legacy) → `maj_a <= NULL` = NULL → 0 ligne → refus (fail-closed, déconnexion voulue).
    const r = await query(
      `SELECT 1 FROM internaute i
         JOIN internaute_auth a ON a.internaute_id = i.id
        WHERE i.id = $1 AND i.efface_a IS NULL AND a.maj_a <= $2::timestamptz`,
      [detail.sub, detail.cev],
    );
    if (r.rows.length === 0) return { refus: refus401() }; // effacé / credential supprimé / session antérieure au reset
    return { internauteId: detail.sub };
  } catch {
    return { refus: refus401() }; // FAIL-CLOSED : panne DB → 401 propre (reconnexion), jamais 500 ni fail-open
  }
}
