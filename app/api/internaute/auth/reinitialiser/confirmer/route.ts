import 'server-only';
import { cookies } from 'next/headers';
import { politiqueMotDePasse, poserMotDePasse } from '../../../../../lib/internaute/authCredential';
import { consommerJetonReset } from '../../../../../lib/internaute/resetMotDePasse';
import { signerSession, optionsCookieClient, NOM_COOKIE_CLIENT } from '../../../../../lib/internaute/authSession';
import { MSG_REQUETE_INVALIDE, MSG_CONFIRMATION_DIVERGE, MSG_LIEN_INVALIDE, MSG_ERREUR } from './presentation';

// Runtime Node explicite (argon2 natif + driver pg). Route PUBLIQUE : hors matcher admin (`/admin`, `/api/admin/*`).
export const runtime = 'nodejs';

/** Erreur JSON générique (aucun détail technique). */
function erreur(message: string, status: number): Response {
  return Response.json({ erreur: message }, { status });
}

/**
 * POST /api/internaute/auth/reinitialiser/confirmer — pose un NOUVEAU mot de passe depuis un lien de reset. Body
 * `{ jeton, motDePasse, motDePasseConfirmation }`.
 *
 * ORDRE (exigences de sécurité) :
 *  1. Parse. Corps invalide → 400 explicite (aucun jeton à protéger).
 *  2. VALIDE la politique (≥ LONGUEUR_MIN) ET la confirmation AVANT de consommer le jeton : un mot de passe refusé NE
 *     BRÛLE PAS le lien (l'internaute corrige et resoumet le MÊME lien). Seul cas d'erreur EXPLICITE (il détient un lien).
 *  3. CONSOMME le jeton (atomique, usage unique). Invalide / expiré / déjà consommé → 400 GÉNÉRIQUE (sans dire lequel).
 *  4. POSE le nouveau mot de passe pour l'`internaute_id` renvoyé par la consommation (jamais un id du corps de requête).
 *  5. OUVRE une session (comme le login) : l'internaute est connecté dans la foulée.
 *
 * IDENTITÉ INCHANGÉE : l'`internaute_id` circule tel quel consommation → pose → session ; aucune nouvelle identité n'est
 * créée. Le changement de credential ne touche QUE `internaute_auth` (via `poserMotDePasse`) → l'historique
 * (`internaute_projet`, `certificat`), rattaché à `internaute.id`, reste intact. Aucun secret / jeton / mot de passe loggé.
 * FERMETURE DES AUTRES SESSIONS : HORS PÉRIMÈTRE (commit final) — ici on n'ouvre que la session du navigateur courant.
 */
export async function POST(request: Request): Promise<Response> {
  // 1. Corps.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return erreur(MSG_REQUETE_INVALIDE, 400);
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const jeton = typeof b.jeton === 'string' ? b.jeton : '';
  const motDePasse = typeof b.motDePasse === 'string' ? b.motDePasse : '';
  const confirmation = typeof b.motDePasseConfirmation === 'string' ? b.motDePasseConfirmation : '';

  // 2. Politique + confirmation AVANT consommation (un refus ne doit pas gâcher le lien). Erreurs EXPLICITES.
  const politique = politiqueMotDePasse(motDePasse);
  if (!politique.ok) return erreur(politique.erreurs[0] ?? MSG_REQUETE_INVALIDE, 400);
  if (confirmation !== motDePasse) return erreur(MSG_CONFIRMATION_DIVERGE, 400);

  // 3. Consommation du jeton (atomique, usage unique). Aucune fuite : cause d'échec non détaillée.
  let internauteId: string | null;
  try {
    internauteId = await consommerJetonReset(jeton);
  } catch {
    return erreur(MSG_ERREUR, 500); // panne DB pendant la consommation → générique, sans détail
  }
  if (!internauteId) return erreur(MSG_LIEN_INVALIDE, 400); // invalide / expiré / déjà consommé

  // 4. Pose du nouveau mot de passe pour l'id SCELLÉ dans le jeton (jamais un id du corps).
  try {
    await poserMotDePasse(internauteId, motDePasse);
  } catch {
    return erreur(MSG_ERREUR, 500); // le jeton est consommé mais la pose a échoué → redemander un lien
  }

  // 5. Ouverture de session (même mécanisme que le login) : connecté dans la foulée.
  const session = await signerSession(internauteId);
  (await cookies()).set(NOM_COOKIE_CLIENT, session, optionsCookieClient(process.env.NODE_ENV === 'production'));
  return Response.json({ ok: true });
}
