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
/**
 * Portée fermée du jeton de RETRAIT de consentement (voie e-mail : désabonnement). STRICTEMENT distincte des deux
 * autres capacités — même secret, scopes séparés : un jeton de retrait n'ouvre NI la rectification NI l'émission,
 * et l'inverse (chaque vérifieur exige SON scope).
 */
const SCOPE_RETRAIT = 'withdraw-consent';
/**
 * Portée fermée du jeton de CONFIRMATION de saisine CADA (X5, voie e-mail interne). STRICTEMENT distincte des trois autres —
 * même secret, scopes séparés : un jeton de confirmation n'ouvre NI rectification NI émission NI retrait, et l'inverse.
 * Son `sub` scelle l'id (numérique) de la DEMANDE ; la page publique n'agit que sur CET id vérifié, jamais un id du client.
 */
const SCOPE_CADA = 'confirm-cada';
/** Durée de vie du jeton (courte : le geste — correction ou émission — suit immédiatement la soumission). */
const EXPIRATION = '30m';
/** Durée de vie du jeton de confirmation CADA : 7 JOURS (il voyage dans un e-mail lu quand l'exploitant a le temps). */
const EXPIRATION_CADA = '7d';

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

/**
 * Frappe un jeton-capacité de RETRAIT de consentement scellant l'UUID de l'internaute (`sub`, scope `withdraw-consent`).
 *
 * SANS EXPIRATION — exception ASSUMÉE au `EXPIRATION` 30 min des jetons rectification/émission. POURQUOI (pas seulement
 * QUE) : le droit de retrait est PERPÉTUEL (RGPD) et ce jeton voyage dans le pied d'un e-mail archivé indéfiniment ; un
 * lien qui expire = cul-de-sac (l'internaute ne pourrait plus se désabonner). Le compromis tient parce que ce jeton
 * n'ouvre qu'un dommage RÉVERSIBLE (un désabonnement se refait en re-consentant par le tunnel) ET que la page publique
 * de retrait ne DIVULGUE AUCUNE donnée personnelle — c'est la contrepartie non négociable de l'absence d'`exp`.
 */
export async function signerJetonRetrait(internauteId: string): Promise<string> {
  return new SignJWT({ scope: SCOPE_RETRAIT })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(internauteId)
    .setIssuedAt()
    .sign(cleSignature()); // aucun setExpirationTime : jeton perpétuel (cf. supra)
}

/**
 * Vérifie signature + scope `withdraw-consent` (aucune expiration à contrôler — ce jeton n'en porte pas) et renvoie
 * l'UUID scellé (`sub`), ou `null`. ⚠️ REJETTE tout jeton d'un autre scope (rectification / émission → `null`).
 */
export async function verifierJetonRetrait(jeton: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(jeton, cleSignature(), { algorithms: ['HS256'] });
    if (payload.scope !== SCOPE_RETRAIT) return null; // un jeton de rectification/émission est REJETÉ ici (scope différent)
    return typeof payload.sub === 'string' && payload.sub !== '' ? payload.sub : null;
  } catch {
    return null; // signature invalide, malformé…
  }
}

/**
 * Frappe un jeton-capacité de CONFIRMATION de saisine CADA (X5) scellant l'id de la DEMANDE (`sub`, scope `confirm-cada`,
 * exp 7 jours). Capacité ÉTROITE : elle n'autorise QUE l'ouverture de la page de confirmation de CETTE demande — l'ACTE
 * (lancer la saisine) part d'un POST déclenché par un clic humain sur cette page, JAMAIS du seul chargement du lien.
 */
export async function signerJetonCada(demandeId: number): Promise<string> {
  return new SignJWT({ scope: SCOPE_CADA })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(demandeId))
    .setIssuedAt()
    .setExpirationTime(EXPIRATION_CADA)
    .sign(cleSignature());
}

/** Résultat de `verifierJetonCada` : DISCRIMINE l'expiration (le lien fonctionnait, il est juste trop vieux → renvoyer vers
 *  l'onglet) d'une invalidité (signature/scope/malformé → lien à ne pas suivre). */
export type VerifCada = { ok: true; demandeId: number } | { ok: false; raison: 'expire' | 'invalide' };

/**
 * Vérifie signature + expiration + scope `confirm-cada` et renvoie l'id de la DEMANDE scellé (`sub`). DISTINGUE l'expiration
 * (`raison:'expire'`) des autres échecs (`raison:'invalide'` : signature, mauvais scope, sub non numérique, malformé) pour que
 * la page affiche le bon message. ⚠️ REJETTE tout jeton d'un autre scope (rectification/émission/retrait → 'invalide').
 */
export async function verifierJetonCada(jeton: string): Promise<VerifCada> {
  try {
    const { payload } = await jwtVerify(jeton, cleSignature(), { algorithms: ['HS256'] });
    if (payload.scope !== SCOPE_CADA) return { ok: false, raison: 'invalide' }; // scope différent → rejeté
    if (typeof payload.sub !== 'string' || !/^\d+$/.test(payload.sub)) return { ok: false, raison: 'invalide' };
    return { ok: true, demandeId: Number(payload.sub) };
  } catch (e) {
    // jose lève JWTExpired (code ERR_JWT_EXPIRED) sur un jeton périmé ; tout le reste = invalide.
    const code = (e as { code?: string })?.code;
    return { ok: false, raison: code === 'ERR_JWT_EXPIRED' ? 'expire' : 'invalide' };
  }
}
