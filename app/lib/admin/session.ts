import 'server-only';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

/** Nom du cookie de session admin. */
export const NOM_COOKIE = 'svv_admin_session';

/** Durée de vie de la session : 8 heures (D2 / EX-18). */
export const TTL_SECONDES = 8 * 3600;

/**
 * Options du cookie de session admin.
 * `secure` dépend de l'environnement (HTTPS en prod uniquement).
 * `path:'/'` OBLIGATOIRE pour que le cookie soit envoyé sur tout le périmètre admin/api.
 */
export function optionsCookie(prod: boolean) {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: prod,
    path: '/',
    maxAge: TTL_SECONDES,
  };
}

/**
 * Clé de signature dérivée de `ADMIN_SESSION_SECRET`.
 * STATELESS : lue à CHAQUE appel (aucun cache mutable au niveau module). Throw si absente.
 */
function cleSignature(): Uint8Array {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error('ADMIN_SESSION_SECRET manquant : impossible de signer/vérifier la session admin.');
  }
  return new TextEncoder().encode(secret);
}

/** Signe un jeton de session admin (JWS `jose`, HS256, exp 8 h). `jti` = identifiant OPAQUE de la SESSION
 *  (UUID), posé à la connexion — utilisé pour tracer la session (jamais une personne) dans le journal de
 *  curation. ADDITIF : `verifierJeton` ne le vérifie pas → les jetons antérieurs (sans jti) restent valides. */
export async function signerJeton(): Promise<string> {
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(cleSignature());
}

/**
 * Vérifie un jeton de session admin.
 * Retourne le payload si valide, `null` en cas d'erreur (signature invalide, expiration, etc.).
 */
export async function verifierJeton(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, cleSignature(), { algorithms: ['HS256'] });
    return payload;
  } catch {
    return null;
  }
}
