import 'server-only';
import { cookies } from 'next/headers';
import { motDePasseValide } from '../../../../lib/admin/password';
import { verifier } from '../../../../lib/admin/motDePasse';
import { trouverCompte, marquerConnexion, permsDuCompte } from '../../../../lib/admin/comptes';
import { NOM_COOKIE, optionsCookie, signerJeton, permsToutes, type SessionAdmin } from '../../../../lib/admin/session';
import { verifierThrottle, noterEchec, noterSucces } from '../../../../lib/auth/antiBruteforce';

/** Hash argon2id de leurre (d'une valeur jetable) : sert au `verifier` de TEMPS CONSTANT quand l'identifiant est
 *  inconnu — l'échec ne révèle alors ni l'existence du compte ni la longueur du mot de passe. */
const HASH_LEURRE = '$argon2id$v=19$m=65536,t=3,p=4$fRN8sFhfdFcpDqG1etqwZg$NodI9TfeUYxTcZ55B9tt3bHe3KcoraiozK7Fta5ukrk';

/** Réponse d'échec UNIQUE et générique (EX-20) : ne révèle jamais si c'est l'identifiant, le mot de passe, ou
 *  l'état actif/inactif qui est en cause. */
function echec(): Response {
  return Response.json({ erreur: 'Identifiants invalides' }, { status: 401 });
}

/** Réponse THROTTLÉE générique (Lot 7) : 429 + Retry-After. Keyée sur la CHAÎNE identifiant (existante ou non)
 *  → ne révèle jamais l'existence d'un compte ; forme générique, comme l'échec normal. */
function reponseThrottlee(retryAfter: number): Response {
  return Response.json(
    { erreur: 'Trop de tentatives. Réessayez plus tard.' },
    { status: 429, headers: { 'Retry-After': String(Math.max(1, retryAfter)) } },
  );
}

/**
 * Ouverture de session : POST { identifiant?, password }.
 *  - Identifiant renseigné → compte nommé de `admin_utilisateur` (refusé si `actif=false`).
 *  - Identifiant vide/absent → VOIE DE SECOURS (ancien mot de passe partagé), session administrateur, sub=null.
 * Anti-force-brute : (1) throttle PROGRESSIF par identifiant (Lot 7, `antiBruteforce.ts`) EN AMONT de la
 * vérification — délai croissant plafonné (jamais un lockout), 429 + Retry-After générique ; (2) le hachage
 * argon2 impose un délai naturel ; un `verifier` de leurre est exécuté même quand l'identifiant est inconnu
 * (temps constant). Message d'échec toujours générique (aucune fuite d'existence). Succès → reset du throttle.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return echec();
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const password = typeof b.password === 'string' ? b.password : '';
  const identifiant = typeof b.identifiant === 'string' ? b.identifiant.trim() : '';
  // Clé de throttle : CHAÎNE identifiant normalisée (minuscules → pas de contournement par la casse ; cohérent
  // avec la recherche de compte insensible à la casse). '' = tentatives sur la voie de secours (mot de passe partagé).
  const cleThrottle = identifiant.toLowerCase();

  // ANTI-FORCE-BRUTE (Lot 7) : throttle progressif AVANT toute vérification (n'appelle PAS password.ts si bloqué).
  // Best-effort → si l'état de détection est indisponible, `bloque:false` (fail-safe : jamais de blocage légitime).
  // ⚠️ BREAK-GLASS (constat revue F1) : la VOIE DE SECOURS (identifiant vide) n'est JAMAIS throttlée — c'est la
  // corde de rappel d'Arno ; un attaquant ne doit pas pouvoir la bloquer en la floodant. Elle reste protégée par
  // `motDePasseValide` (comparaison SHA-256 À TEMPS CONSTANT du secret partagé `ADMIN_PASSWORD`) — INCHANGÉ vs la
  // baseline pré-Lot-7 ; ce secret doit rester À HAUTE ENTROPIE (SHA-256 est rapide, pas un KDF lent). La CLI
  // `admin:secours` contourne aussi la route. Le throttle ne s'applique donc qu'aux comptes NOMMÉS → il existe
  // TOUJOURS une voie de connexion non throttlée (pas de DoS-lockout système).
  const throttle = cleThrottle === '' ? { bloque: false, retryAfter: 0 } : await verifierThrottle(cleThrottle);
  if (throttle.bloque) return reponseThrottlee(throttle.retryAfter);

  let session: SessionAdmin;

  if (identifiant === '') {
    // ═══ VOIE DE SECOURS — à retirer au lot M3-5 après bascule ═══
    // Mot de passe partagé (app/lib/admin/password.ts) → accès administrateur complet, compte anonyme (sub=null).
    if (!motDePasseValide(password)) {
      await noterEchec(cleThrottle); // enregistre l'échec (throttle) + audit agrégé
      return echec();
    }
    session = { sub: null, identifiant: null, role: 'administrateur', perms: permsToutes(), doitChanger: false };
    // ═══ FIN VOIE DE SECOURS ═══
  } else {
    // Voie NOMMÉE : compte de admin_utilisateur. Verify TOUJOURS exécuté (hash réel si trouvé, leurre sinon) →
    // temps constant, aucune fuite d'existence/état ; tous les cas d'échec renvoient le message générique.
    const compte = await trouverCompte(identifiant).catch(() => null);
    const hash = compte?.mot_de_passe ?? HASH_LEURRE;
    const motOk = await verifier(password, hash);
    if (!compte || !compte.actif || !motOk) {
      await noterEchec(cleThrottle); // échec (compte inconnu, inactif OU mauvais mot de passe) → même traitement
      return echec();
    }
    await marquerConnexion(compte.id);
    session = {
      sub: compte.id,
      identifiant: compte.identifiant,
      role: compte.role,
      perms: permsDuCompte(compte),
      doitChanger: compte.doit_changer_mot_de_passe, // M3-4 Lot B : le drapeau entre dans le JWS
    };
  }

  await noterSucces(cleThrottle); // SUCCÈS (secours ou nommé) → reset des échecs de cet identifiant + audit agrégé
  const jeton = await signerJeton(session);
  (await cookies()).set(NOM_COOKIE, jeton, optionsCookie(process.env.NODE_ENV === 'production'));
  return Response.json({ ok: true });
}

/** Déconnexion : DELETE → cookie effacé (EX-21). */
export async function DELETE() {
  (await cookies()).delete({ name: NOM_COOKIE, path: '/' });
  return Response.json({ ok: true });
}
