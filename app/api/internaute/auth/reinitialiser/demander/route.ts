import 'server-only';
import { resoudreCredentialParEmail } from '../../../../../lib/internaute/authCredential';
import { cleThrottleReset, verifierThrottleReset, noterDemandeReset } from '../../../../../lib/internaute/resetThrottle';
import { creerJetonReset } from '../../../../../lib/internaute/resetMotDePasse';
import { lireConfigEmail, obtenirTransporteur, envoyerReinitialisation } from '../../../../../lib/email';
import { MESSAGE_REINITIALISATION } from './presentation';

// Runtime Node explicite (driver pg + transport SMTP). Route PUBLIQUE : hors matcher admin (`/admin`, `/api/admin/*`).
export const runtime = 'nodejs';

/** Base absolue du site (serveur only), pour le lien de reset. `null` si absente/mal formée. Même règle que le publisher certificat. */
function siteUrl(): string | null {
  const u = (process.env.SITE_URL ?? '').trim();
  return /^https?:\/\/.+/.test(u) ? u.replace(/\/+$/, '') : null;
}

/**
 * RÉPONSE GÉNÉRIQUE UNIQUE — même corps, même statut (200), dans TOUS les cas : corps invalide, throttle bloqué, e-mail
 * inconnu / effacé / sans compte, OU compte trouvé + e-mail envoyé. Aucune branche n'est distinguable par le contenu ni
 * le code. C'est la seule Response de cette route.
 */
function reponseGenerique(): Response {
  return Response.json({ message: MESSAGE_REINITIALISATION }, { status: 200 });
}

/**
 * POST /api/internaute/auth/reinitialiser/demander — DEMANDE de « mot de passe oublié ». Body `{ email }`.
 *
 * ORDRE (exigence de sécurité) :
 *  1. Parse + normalise l'e-mail (trim + minuscules). Corps invalide/vide → réponse générique (aucune erreur distinctive).
 *  2. THROTTLE D'ABORD, AVANT toute résolution de compte (sinon oracle de timing sur l'existence) : `verifierThrottleReset`
 *     puis `noterDemandeReset` (compte TOUTES les demandes). Si bloqué → réponse générique (le throttle n'est PAS révélé).
 *  3. Résout l'e-mail → internaute AVEC compte. Aucun compte → ni jeton, ni e-mail. Compte → `creerJetonReset` (secret en
 *     clair une seule fois) → lien absolu `${SITE_URL}/espace/reinitialiser?j=<secret>` → e-mail via le transport générique.
 *  4. Réponse GÉNÉRIQUE identique dans tous les cas.
 *
 * SÉCURITÉ : fail-safe du throttle conservé (panne DB → ne bloque pas). L'e-mail est envoyé SANS être attendu (le temps de
 * réponse ne dépend donc pas de l'existence du compte → pas d'oracle de timing). Aucun e-mail, secret ni jeton loggé
 * (aucun `console.*`, et l'échec d'envoi est avalé sans journaliser son message — qui pourrait contenir l'adresse).
 */
export async function POST(request: Request): Promise<Response> {
  // 1. Corps + normalisation. Toute anomalie → réponse générique (jamais distinctive).
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reponseGenerique();
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (email === '') return reponseGenerique();

  // 2. THROTTLE d'abord (avant de savoir si un compte existe). On compte la demande dans tous les cas.
  const cle = cleThrottleReset(email);
  const verdict = await verifierThrottleReset(cle);
  await noterDemandeReset(cle);
  if (verdict.bloque) return reponseGenerique(); // ne révèle pas le throttle : même réponse que le nominal

  // 3. Résolution du compte. `.catch` → traité comme « aucun compte » (fail-safe, aucune fuite).
  const cred = await resoudreCredentialParEmail(email).catch(() => null);
  if (cred) {
    // Compte trouvé : jeton + e-mail. Enveloppé : toute défaillance reste silencieuse → réponse générique inchangée.
    try {
      const secret = await creerJetonReset(cred.internauteId); // secret en clair, une seule fois
      const base = siteUrl();
      const config = lireConfigEmail();
      if (base && config) {
        const lien = `${base}/espace/reinitialiser?j=${secret}`;
        // Envoi NON attendu : le temps de réponse ne dépend pas de l'existence du compte (anti-oracle de timing).
        // Échec avalé SANS log (le message d'erreur pourrait contenir l'adresse).
        void envoyerReinitialisation(obtenirTransporteur(config), config.from, { to: email, lien }).catch(() => {});
      }
    } catch {
      /* jeton/config indisponible → pas d'e-mail, mais réponse générique inchangée (aucune fuite) */
    }
  }

  // 4. Réponse GÉNÉRIQUE — identique, que le compte existe ou non.
  return reponseGenerique();
}
