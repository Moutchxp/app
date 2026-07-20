import 'server-only';
import { cookies } from 'next/headers';
import { resoudreCredentialParEmail, verifier } from '../../../../lib/internaute/authCredential';
import { signerSession, optionsCookieClient, NOM_COOKIE_CLIENT } from '../../../../lib/internaute/authSession';
import { cleThrottle, verifierThrottle, noterEchec, noterSucces } from '../../../../lib/internaute/authThrottle';

// Runtime Node explicite (argon2 natif + driver pg). Route PUBLIQUE : hors matcher admin (`/admin`, `/api/admin/*`).
export const runtime = 'nodejs';

/** Hash argon2id de LEURRE (préimage ALÉATOIRE) : `verifier` de TEMPS CONSTANT quand l'e-mail est inconnu / sans
 *  compte / effacé — l'échec ne révèle NI l'existence d'un compte NI la longueur du mot de passe. Valeur non secrète. */
const HASH_LEURRE = '$argon2id$v=19$m=65536,t=3,p=4$xn40m+3vdz314gx7qIbvzw$VHiUl7NbSk0VWFTGyqcHYFZwkf715ZNNNWNKlk+L3yc';

/** Échec UNIQUE et générique : ne révèle jamais si c'est l'e-mail, le mot de passe, ou l'état du dossier qui est en cause. */
function echec(): Response {
  return Response.json({ erreur: 'Identifiants invalides' }, { status: 401 });
}

/**
 * POST /api/internaute/auth/login — ouverture de session CLIENT. Body `{ email, motDePasse }`.
 * Anti-force-brute PROGRESSIF (throttle par e-mail HACHÉ, EN AMONT de la vérification) ; `verifier` argon2 TOUJOURS
 * exécuté (hash réel si compte, LEURRE sinon → temps constant, aucune fuite d'existence) ; message d'échec GÉNÉRIQUE.
 * Succès → cookie `svv_client_session` + reset du throttle. Ne crée AUCUN compte (le credential doit préexister).
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return echec();
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const email = typeof b.email === 'string' ? b.email.trim() : '';
  const motDePasse = typeof b.motDePasse === 'string' ? b.motDePasse : '';
  if (email === '') return echec();

  const cle = cleThrottle(email);
  const throttle = await verifierThrottle(cle);
  if (throttle.bloque) {
    return Response.json(
      { erreur: 'Trop de tentatives. Réessayez plus tard.' },
      { status: 429, headers: { 'Retry-After': String(Math.max(1, throttle.retryAfter)) } },
    );
  }

  // Verify TOUJOURS exécuté (hash réel si trouvé, LEURRE sinon) → temps constant, aucune fuite d'existence de compte.
  const cred = await resoudreCredentialParEmail(email).catch(() => null);
  const hash = cred?.hash ?? HASH_LEURRE;
  const motOk = await verifier(motDePasse, hash);
  if (!cred || !motOk) {
    await noterEchec(cle); // e-mail inconnu, sans compte, effacé, OU mauvais mot de passe → même traitement
    return echec();
  }

  await noterSucces(cle); // reset du throttle
  const jeton = await signerSession(cred.internauteId);
  (await cookies()).set(NOM_COOKIE_CLIENT, jeton, optionsCookieClient(process.env.NODE_ENV === 'production'));
  return Response.json({ ok: true });
}
