import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { lireMajCredential } from './credentialMaj';

/**
 * SESSION INTERNAUTE (JWS apatride, jose HS256) — TOTALEMENT SÉPARÉE de la session admin. Calquée sur
 * `app/lib/admin/session.ts` mais avec un SECRET, un COOKIE et un TTL DÉDIÉS. Aucune notion de rôle/permission.
 *
 * F1 (SCELLAGE INERTE) : en plus du `sub` (UUID), le JWS scelle désormais une claim `cev` (« credential émis à » =
 * `internaute_auth.maj_a`, pleine précision). Elle est POSÉE à la signature et EXPOSÉE par `verifierSessionDetail`, mais
 * ENCORE VÉRIFIÉE NULLE PART — la garde continue d'utiliser `verifierSession` (contrat `sub | null` inchangé). C'est le
 * commit F2 qui comparera `cev` à `maj_a` pour révoquer les sessions antérieures à un changement de mot de passe.
 * Rétrocompatible : les jetons déjà émis n'ont pas de `cev` (→ `null` ici), rien n'est invalidé par ce commit.
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

/**
 * Signe une session internaute (HS256). `sub` = UUID ; `jti` opaque ; `exp` = TTL ; et `cev` = `internaute_auth.maj_a`
 * (pleine précision) LU AVANT de signer. Les 3 appelants (login, création, reset) posent le credential AVANT `signerSession`
 * → `cev` reflète le dernier `maj_a` (au reset, la session fraîche scelle donc le NOUVEAU `maj_a` et survivra en F2).
 * Aucune ligne `internaute_auth` (cas théorique) → claim `cev` OMISE (pas de valeur nulle scellée) : F2 traitera un jeton
 * sans `cev` en fail-closed.
 */
export async function signerSession(internauteId: string): Promise<string> {
  const cev = await lireMajCredential(internauteId);
  const revendications = cev !== null ? { cev } : {}; // claim omise si le credential n'existe pas encore
  return new SignJWT(revendications)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(internauteId)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSecondes())
    .sign(cleSignature());
}

/** Contenu vérifié d'une session : `sub` (UUID) + `cev` (« credential émis à », `null` pour un jeton antérieur à F1). */
export interface SessionVerifiee {
  sub: string;
  cev: string | null;
}

/**
 * Vérifie une session et EXPOSE `sub` + `cev`. `cev` est `null` si absent (jeton legacy) ou mal typé. Renvoie `null` si
 * signature/`exp`/format invalide, ou `sub` vide. ⚠️ F1 : cette fonction existe pour F2 — elle n'est encore appelée par
 * AUCUNE garde ; `cev` n'est comparé nulle part.
 */
export async function verifierSessionDetail(token: string): Promise<SessionVerifiee | null> {
  try {
    const { payload } = await jwtVerify(token, cleSignature(), { algorithms: ['HS256'] });
    const sub = typeof payload.sub === 'string' && payload.sub !== '' ? payload.sub : null;
    if (!sub) return null;
    const cev = typeof payload.cev === 'string' && payload.cev !== '' ? payload.cev : null;
    return { sub, cev };
  } catch {
    return null;
  }
}

/**
 * Vérifie une session internaute. Renvoie l'UUID scellé (`sub`) si valide, `null` sinon. CONTRAT INCHANGÉ (F1) : délègue
 * à `verifierSessionDetail` et n'en garde que le `sub` → la garde `exigerInternaute` continue de l'utiliser à l'identique.
 */
export async function verifierSession(token: string): Promise<string | null> {
  const detail = await verifierSessionDetail(token);
  return detail ? detail.sub : null;
}
