import 'server-only';
/**
 * Module INTERNAUTE — JETON-CAPACITÉ de rectification publique (serveur only).
 *
 * PROBLÈME RÉSOLU : à la fin du tunnel, un internaute ANONYME (non authentifié) doit pouvoir corriger SES PROPRES
 * coordonnées (email/téléphone) sur le dossier qu'il vient de créer, SANS jamais pouvoir toucher le dossier d'un
 * autre. La route admin de rectification (LOT 4) est réservée au rôle administrateur → inutilisable ici.
 *
 * PARADE IDOR : on ne fait JAMAIS confiance à un `id` fourni par le client. À l'ingestion, le serveur frappe un
 * JETON SIGNÉ (JWS `jose`, HS256) scellant l'UUID du dossier dans son `sub` + un `scope` fermé. La route publique de
 * rectification n'agit que sur l'`id` EXTRAIT du jeton vérifié → un client ne peut pas forger un jeton pour un autre
 * dossier sans le secret serveur. Jeton COURT (30 min), gardé en mémoire côté front, jamais dans l'URL.
 *
 * SECRET DÉDIÉ `INTERNAUTE_TOKEN_SECRET` — DISTINCT de `ADMIN_SESSION_SECRET` (séparation des secrets : un jeton
 * public ne doit jamais être signé avec la clé des sessions admin). AUCUN import moteur / analytics → cloisonnement M2.
 */
import { SignJWT, jwtVerify } from 'jose';

/** Portée fermée du jeton de RECTIFICATION : seule la correction des coordonnées (email/téléphone) est permise. */
const SCOPE_RECTIFICATION = 'rectify-contact';
/**
 * Portée fermée du jeton d'ÉMISSION : seule l'émission du certificat de CE projet est permise. STRICTEMENT distinct
 * de la rectification (le `scope` sépare les deux capacités, avec le MÊME secret). Un jeton de rectification ne doit
 * JAMAIS ouvrir l'émission, ni l'inverse — chaque vérifieur exige SON scope.
 */
const SCOPE_EMISSION = 'emit-certificate';
/** Durée de vie du jeton (courte : le geste — correction ou émission — suit immédiatement la soumission). */
const EXPIRATION = '30m';

/** Clé de signature dérivée du secret DÉDIÉ. Échoue proprement si la variable manque (fail-safe, jamais de repli sur le secret admin). */
function cleSignature(): Uint8Array {
  const secret = process.env.INTERNAUTE_TOKEN_SECRET;
  if (!secret) {
    throw new Error('INTERNAUTE_TOKEN_SECRET manquant : impossible de signer/vérifier un jeton de rectification.');
  }
  return new TextEncoder().encode(secret);
}

/** Frappe un jeton-capacité scellant l'UUID du dossier créé (scope fermé, exp 30 min). */
export async function signerJetonRectification(internauteId: string): Promise<string> {
  return new SignJWT({ scope: SCOPE_RECTIFICATION })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(internauteId)
    .setIssuedAt()
    .setExpirationTime(EXPIRATION)
    .sign(cleSignature());
}

/**
 * Vérifie signature + expiration + scope, et renvoie l'UUID scellé (`sub`) ou `null` si le jeton est invalide /
 * expiré / de scope inattendu. L'appelant utilise CE seul id — jamais un id venu du corps de requête.
 */
export async function verifierJetonRectification(jeton: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(jeton, cleSignature(), { algorithms: ['HS256'] });
    if (payload.scope !== SCOPE_RECTIFICATION) return null; // un jeton d'ÉMISSION est REJETÉ ici (scope différent)
    return typeof payload.sub === 'string' && payload.sub !== '' ? payload.sub : null;
  } catch {
    return null; // signature invalide, jeton expiré, malformé…
  }
}

/**
 * Frappe un jeton-capacité d'ÉMISSION scellant le `projetId` dans son `sub` (scope fermé, exp 30 min). Capacité
 * ÉTROITE : elle n'autorise QUE l'émission du certificat de CE projet, RIEN d'autre (ni rectification du dossier).
 * Émis pour TOUT projet posté (e-mail neuf OU connu) — l'ownership du projet est prouvée par la possession de ce jeton.
 */
export async function signerJetonEmission(projetId: number): Promise<string> {
  return new SignJWT({ scope: SCOPE_EMISSION })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(projetId))
    .setIssuedAt()
    .setExpirationTime(EXPIRATION)
    .sign(cleSignature());
}

/**
 * Vérifie signature + expiration + scope `emit-certificate`, et renvoie le `projetId` scellé (`sub`), ou `null`.
 * ⚠️ REJETTE tout jeton dont le scope n'est pas EXACTEMENT `emit-certificate` (un jeton de rectification → `null`).
 */
export async function verifierJetonEmission(jeton: string): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(jeton, cleSignature(), { algorithms: ['HS256'] });
    if (payload.scope !== SCOPE_EMISSION) return null; // un jeton de RECTIFICATION est REJETÉ ici (scope différent)
    if (typeof payload.sub !== 'string' || !/^\d+$/.test(payload.sub)) return null;
    return Number(payload.sub);
  } catch {
    return null; // signature invalide, jeton expiré, malformé…
  }
}
