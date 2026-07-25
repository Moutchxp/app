import 'server-only';
import { cookies } from 'next/headers';
import { exigerInternaute } from '../../../../../lib/internaute/authGarde';
import { resoudreHashParId, verifier } from '../../../../../lib/internaute/authCredential';
import { cleThrottleSuppression, verifierThrottle, noterEchec, noterSucces } from '../../../../../lib/internaute/authThrottle';
import { effacerInternaute } from '../../../../../lib/internaute/cycleVie';
import { NOM_COOKIE_CLIENT } from '../../../../../lib/internaute/authSession';

// Runtime Node (argon2 natif + driver pg). Route AUTHENTIFIÉE et DESTRUCTIVE.
export const runtime = 'nodejs';

/**
 * POST /api/internaute/espace/compte/supprimer — SUPPRESSION (anonymisation en place) du compte de l'internaute CONNECTÉ.
 * Body `{ motDePasse }`. DESTRUCTIF & IRRÉVERSIBLE.
 *
 * SÉCURITÉ — l'id supprimé est TOUJOURS `garde.internauteId` (session), JAMAIS un id du corps. ORDRE IMPÉRATIF :
 *  1. THROTTLE (clé DISJOINTE `suppr:<id>` — une session volée ne sert pas d'oracle de mot de passe) ; fail-safe.
 *  2. VÉRIFICATION du mot de passe (re-lecture du hash par id + `verifier` argon2 — aucune 2ᵉ primitive).
 *  3. SEULEMENT si correct → `effacerInternaute` (auteur = null : pas un admin ; canal = 'espace_client', cf. J1).
 *  4. Destruction de la session (cookie `svv_client_session` effacé).
 * Mot de passe faux → 401 générique + `noterEchec` (throttle). Aucun log de PII ni de mot de passe.
 * ⚠️ `effacerInternaute` CONSERVE projet/certificat (jamais supprimés) ; la gate `a_un_compte` fermée éteint
 * l'authentification en ligne des certificats — comportement VOULU (scénario A).
 */
export async function POST(request: Request): Promise<Response> {
  const garde = await exigerInternaute(request);
  if ('refus' in garde) return garde.refus;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ erreur: 'requête invalide' }, { status: 400 });
  }
  const motDePasse = typeof (body as Record<string, unknown>)?.motDePasse === 'string' ? (body as { motDePasse: string }).motDePasse : '';

  // 1. Throttle EN AMONT (clé disjointe, keyée par l'id de session).
  const cle = cleThrottleSuppression(garde.internauteId);
  const throttle = await verifierThrottle(cle);
  if (throttle.bloque) {
    return Response.json(
      { erreur: 'Trop de tentatives. Réessayez plus tard.' },
      { status: 429, headers: { 'Retry-After': String(Math.max(1, throttle.retryAfter)) } },
    );
  }

  // 2. Vérification du mot de passe (hash lu par id de SESSION ; `verifier` renvoie false si hash absent/malformé).
  const hash = await resoudreHashParId(garde.internauteId).catch(() => null);
  const motOk = hash !== null && (await verifier(motDePasse, hash));
  if (!motOk) {
    await noterEchec(cle); // mauvais mot de passe → incrément du throttle
    return Response.json({ erreur: 'Mot de passe incorrect' }, { status: 401 });
  }

  // 3. Effacement (SEULEMENT après vérif). auteur = null (pas un admin) ; canal = espace_client.
  let efface = false;
  try {
    ({ efface } = await effacerInternaute(garde.internauteId, null, 'espace_client'));
  } catch {
    return Response.json({ erreur: 'suppression indisponible' }, { status: 503 });
  }
  if (!efface) return Response.json({ erreur: 'suppression indisponible' }, { status: 503 }); // ne devrait pas arriver (garde a vérifié l'existence)

  await noterSucces(cle); // reset du throttle (best-effort)

  // 4. Destruction de la session (même cookie que la pose).
  (await cookies()).delete({ name: NOM_COOKIE_CLIENT, path: '/' });
  return Response.json({ ok: true });
}
