import 'server-only';
import { cookies } from 'next/headers';
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
 * Hash argon2 du secret break-glass, DÉCODÉ depuis `ADMIN_PASSWORD_ARGON2_B64` (base64 → hash argon2id).
 *
 * ⚠️ POURQUOI EN BASE64 : le loader `.env` de Next (`@next/env`) applique une EXPANSION de variables dotenv qui
 * remplace toute séquence `$mot` par la valeur d'une variable d'env (vide si inconnue). Un hash argon2 brut
 * (`$argon2id$v=19$m=…$sel$hash`) y perd donc tous ses segments `$…` → mutilé au runtime → `verifier` échoue (bug
 * du 401). Le BASE64 (alphabet `A-Za-z0-9+/=`) ne contient AUCUN `$` → rien à expanser → la valeur arrive intacte.
 *
 * ⚠️ POURQUOI `HASH_LEURRE` (et non `''`) EN REPLI : quand la var est absente/vide/se décode en chaîne vide, on
 * renvoie le LEURRE — pas `''`. Motif TEMPS CONSTANT (anti-énumération) : `verifier(password, '')` est rejeté
 * INSTANTANÉMENT par argon2 (hash malformé, aucun calcul), alors qu'un secret erroné contre un vrai hash déclenche
 * un argon2 complet (~ms). Cet écart de timing (~1700×) trahirait, par la seule mesure du temps de réponse, si le
 * break-glass est ARMÉ — or cette voie est délibérément NON throttlée. Le leurre force un argon2 complet dans TOUS
 * les cas → « non armé » indiscernable de « mauvais secret ». Symétrique de la voie NOMMÉE (`… ?? HASH_LEURRE`).
 *
 * FAIL-CLOSED : le leurre a une préimage inconnue → il ne matche JAMAIS le mot de passe saisi → echec() STANDARD.
 * TOLÉRANT : ne throw JAMAIS (ni `process.env`, ni `Buffer.from`/`toString`, + try/catch de garde). Une valeur
 * base64 NON vide mais corrompue est passée telle quelle à `verifier` (qui la rejette) — cas de configuration
 * transitoire, sans révélation du secret.
 */
function hashBreakGlass(): string {
  const b64 = process.env.ADMIN_PASSWORD_ARGON2_B64;
  if (!b64) return HASH_LEURRE;
  try {
    return Buffer.from(b64, 'base64').toString('utf8') || HASH_LEURRE;
  } catch {
    return HASH_LEURRE;
  }
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
  // ⚠️ BREAK-GLASS (revue Lot 7 F1) : la VOIE DE SECOURS (identifiant vide) n'est JAMAIS throttlée — c'est la
  // corde de rappel d'Arno ; un attaquant ne doit pas pouvoir la bloquer en la floodant. Elle est protégée par un
  // hash argon2id LENT (`verifier` contre `ADMIN_PASSWORD_ARGON2_B64`, décodé de base64) qui freine le brute-force
  // MÊME sans throttle. La
  // CLI `admin:secours` contourne aussi la route. Le throttle ne s'applique donc qu'aux comptes NOMMÉS → il existe
  // TOUJOURS une voie de connexion non throttlée (pas de DoS-lockout système).
  const throttle = cleThrottle === '' ? { bloque: false, retryAfter: 0 } : await verifierThrottle(cleThrottle);
  if (throttle.bloque) return reponseThrottlee(throttle.retryAfter);

  let session: SessionAdmin;

  if (identifiant === '') {
    // ═══ VOIE DE SECOURS (break-glass) — à retirer au lot M3-5 après bascule ═══
    // Secret partagé vérifié en argon2id (hash LENT) via `verifier`, contre le hash décodé de `ADMIN_PASSWORD_ARGON2_B64`
    // (base64 — immunisé contre l'expansion `@next/env` qui mutilait l'ancien hash brut ; cf. `hashBreakGlass`).
    // BASCULE NETTE : plus AUCUNE comparaison SHA-256 rapide (`password.ts`/`ADMIN_PASSWORD` deviennent ORPHELINS).
    // FAIL-CLOSED + TEMPS CONSTANT : var absente/vide → `hashBreakGlass()` renvoie le LEURRE (pas `''`) → `verifier`
    // exécute un argon2 complet puis renvoie false → echec() STANDARD, sans révéler par le TIMING que la variable
    // manque (anti-énumération, cf. `hashBreakGlass`). Le secret n'est ni stocké ni haché ici : seul son hash argon2
    // encodé base64 (généré hors ligne via `admin:secours-hash`) est en env.
    // → accès administrateur complet, compte anonyme (sub=null).
    if (!(await verifier(password, hashBreakGlass()))) {
      await noterEchec(cleThrottle); // audit agrégé de l'échec (la voie secours reste NON throttle-checkée — Lot 7 F1)
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
