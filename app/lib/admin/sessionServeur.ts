import 'server-only';
import { NOM_COOKIE, verifierJeton } from './session';

/** Identité de SESSION (jamais une personne) lue depuis le cookie admin d'une requête API. */
export interface SessionCuration {
  /** `jti` du JWS (UUID de session) ; `null` si absent/illisible (jeton antérieur au traçage, ou pas de cookie). */
  jti: string | null;
  /** Ouverture de la session = `iat` du jeton (Date) ; `null` si absent/illisible. */
  iat: Date | null;
}

/** Extrait la valeur d'un cookie du header `Cookie` brut (sans dépendance `next/headers`, testable simplement). */
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

/**
 * Lit la session de curation depuis le cookie `svv_admin_session` de la requête. TOLÉRANTE : ne lève JAMAIS
 * d'exception (cookie absent, jeton invalide/expiré, `iat`/`jti` manquants → `{ jti:null, iat:null }`).
 * Aucune route ne doit planter si la session est illisible : la traçabilité est un ajout additif, jamais un
 * point de rupture d'une mutation métier. `iat` (secondes epoch) → `Date`.
 */
export async function lireSessionCuration(request: Request): Promise<SessionCuration> {
  try {
    const jeton = lireCookie(request, NOM_COOKIE);
    if (!jeton) return { jti: null, iat: null };
    const payload = await verifierJeton(jeton);
    if (!payload) return { jti: null, iat: null };
    const jti = typeof payload.jti === 'string' ? payload.jti : null;
    const iat = typeof payload.iat === 'number' ? new Date(payload.iat * 1000) : null;
    return { jti, iat };
  } catch {
    return { jti: null, iat: null };
  }
}
