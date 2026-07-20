import 'server-only';
import { SignJWT, jwtVerify } from 'jose';

/**
 * SESSION INTERNAUTE (JWS apatride, jose HS256) — TOTALEMENT SÉPARÉE de la session admin. Calquée sur
 * `app/lib/admin/session.ts` mais avec un SECRET, un COOKIE et un TTL DÉDIÉS. Aucune notion de rôle/permission :
 * une session internaute ne porte QUE le `sub` = UUID de la personne.
 */

/** Nom du cookie de session CLIENT. Distinct du cookie admin `svv_admin_session`. */
export const NOM_COOKIE_CLIENT = 'svv_client_session';

/** Durée de vie de la session (secondes). Pilotée par `SESSION_INTERNAUTE_TTL`, défaut 30 jours. */
export function ttlSecondes(): number {
  const v = Number(process.env.SESSION_INTERNAUTE_TTL);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 30 * 24 * 3600;
}

/**
 * Options du cookie de session CLIENT. ⚠️ `SameSite=Lax` (PAS `strict` comme l'admin) : le site est PUBLIC et une
 * session peut s'ouvrir via une arrivée depuis un lien e-mail — `strict` n'enverrait pas le cookie au premier
 * chargement. `httpOnly` (jamais lisible en JS), `secure` en prod (HTTPS uniquement), `path:'/'`.
 */
export function optionsCookieClient(prod: boolean) {
  return { httpOnly: true, sameSite: 'lax' as const, secure: prod, path: '/', maxAge: ttlSecondes() };
}

/**
 * Clé de signature dérivée d'`INTERNAUTE_SESSION_SECRET` — DISTINCT d'`ADMIN_SESSION_SECRET` (session admin) ET
 * d'`INTERNAUTE_TOKEN_SECRET` (jetons-capacité 30 min). Lue à CHAQUE appel (apatride) ; throw si absente (fail-closed).
 */
function cleSignature(): Uint8Array {
  const secret = process.env.INTERNAUTE_SESSION_SECRET;
  if (!secret) {
    throw new Error('INTERNAUTE_SESSION_SECRET manquant : impossible de signer/vérifier la session internaute.');
  }
  return new TextEncoder().encode(secret);
}

/** Signe une session internaute (HS256). `sub` = UUID de l'internaute ; `jti` opaque ; exp = TTL. */
export async function signerSession(internauteId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(internauteId)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSecondes())
    .sign(cleSignature());
}

/** Vérifie une session internaute. Renvoie l'UUID scellé (`sub`) si valide, `null` sinon (signature/exp/malformé). */
export async function verifierSession(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, cleSignature(), { algorithms: ['HS256'] });
    return typeof payload.sub === 'string' && payload.sub !== '' ? payload.sub : null;
  } catch {
    return null;
  }
}
