import 'server-only';
import { cookies } from 'next/headers';
import { verifier } from '../../../../lib/admin/motDePasse';
import { trouverCompte, marquerConnexion, permsDuCompte, capaciteModifPermis } from '../../../../lib/admin/comptes';
import { NOM_COOKIE, optionsCookie, signerJeton, verifierJeton, sessionDepuisPayload, type SessionAdmin } from '../../../../lib/admin/session';
import { verifierThrottle, noterEchec, noterSucces, cleThrottleIp, verifierThrottleIp, noterEchecIp } from '../../../../lib/auth/antiBruteforce';
import { empreinteMotDePasse, lireEtatCompte, revoquerSessions } from '../../../../lib/admin/etatSession';
import { journaliserConnexion, purgerJournalConnexions, type ResultatConnexion } from '../../../../lib/auth/journalConnexion';

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
 * Ouverture de session : POST { identifiant, password } — compte nommé de `admin_utilisateur` (refusé si `actif=false`).
 * ⚠️ VOIE DE SECOURS RETIRÉE (décision d'Arno du 15/10/2026, audit point A) : un identifiant VIDE est refusé (401 générique,
 * compté comme un échec), sans jamais lire `ADMIN_PASSWORD_ARGON2_B64` ni vérifier quoi que ce soit. Le secours passe
 * UNIQUEMENT par `npm run admin:secours` sur le serveur (docs/BASCULE_CHECKLIST.md, « Si je ne peux plus me connecter »).
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
  // avec la recherche de compte insensible à la casse). '' = identifiant vide (ancienne voie de secours, refusée).
  const cleThrottle = identifiant.toLowerCase();

  // ANTI-FORCE-BRUTE (Lot 7) : throttle progressif AVANT toute vérification (n'appelle PAS password.ts si bloqué).
  // Best-effort → si l'état de détection est indisponible, `bloque:false` (fail-safe : jamais de blocage légitime).
  // AUDIT POINT 3 : limite par ADRESSE (empreinte HMAC, jamais en clair) en plus de la limite par compte. `null` si l'adresse
  // n'est pas établie de façon sûre → pas de limite par IP (jamais un compteur commun qui bloquerait Arno).
  const cleIp = cleThrottleIp(request);
  // AUDIT POINT 8 : chaque tentative laisse une ligne (identifiant, compte, résultat, adresse EN EMPREINTE). Best-effort.
  const journal = (resultat: ResultatConnexion, compteId: number | null = null) =>
    journaliserConnexion({ identifiant: cleThrottle, compteId, resultat, ipEmpreinte: cleIp ? cleIp.slice('ip:'.length) : null });

  const throttle = await verifierThrottle(cleThrottle);
  if (throttle.bloque) {
    await journal('bloque');
    return reponseThrottlee(throttle.retryAfter);
  }
  if (cleIp) {
    const parIp = await verifierThrottleIp(cleIp);
    if (parIp.bloque) {
      await journal('bloque');
      return reponseThrottlee(parIp.retryAfter);
    }
  }
  const noterLesEchecs = async (compteId: number | null = null) => {
    await noterEchec(cleThrottle);
    if (cleIp) await noterEchecIp(cleIp);
    await journal('echec', compteId);
  };

  // VOIE DE SECOURS RETIRÉE (15/10/2026) : identifiant vide → refus générique, compté comme un échec (audit), rien vérifié.
  if (identifiant === '') {
    await noterLesEchecs();
    return echec();
  }

  // Compte nommé de admin_utilisateur. Verify TOUJOURS exécuté (hash réel si trouvé, leurre sinon) →
  // temps constant, aucune fuite d'existence/état ; tous les cas d'échec renvoient le message générique.
  const compte = await trouverCompte(identifiant).catch(() => null);
  const hash = compte?.mot_de_passe ?? HASH_LEURRE;
  const motOk = await verifier(password, hash);
  if (!compte || !compte.actif || !motOk) {
    await noterLesEchecs(compte?.id ?? null); // échec (compte inconnu, inactif OU mauvais mot de passe) → même traitement
    return echec();
  }
  await marquerConnexion(compte.id);
  const session: SessionAdmin = {
    sub: compte.id,
    identifiant: compte.identifiant,
    role: compte.role,
    perms: permsDuCompte(compte),
    doitChanger: compte.doit_changer_mot_de_passe, // M3-4 Lot B : le drapeau entre dans le JWS
    peutModifierPermis: capaciteModifPermis(compte), // RATT-EDIT lot A3 — capacité EFFECTIVE (subordination incluse) portée dans le JWS
    // AUDIT POINTS 4-5 : empreinte du mot de passe et version de session, que le proxy compare à la base à chaque requête.
    empreinteMdp: empreinteMotDePasse(compte.mot_de_passe),
    versionSession: (await lireEtatCompte(compte.id).catch(() => null))?.versionSession ?? undefined,
  };

  await noterSucces(cleThrottle); // SUCCÈS → reset des échecs de cet identifiant + audit agrégé
  await journal('succes', compte.id);
  await purgerJournalConnexions(); // conservation 12 mois (réglable) : les lignes plus anciennes sont effacées
  const jeton = await signerJeton(session);
  (await cookies()).set(NOM_COOKIE, jeton, optionsCookie(process.env.NODE_ENV === 'production'));
  return Response.json({ ok: true });
}

/**
 * Déconnexion : DELETE → cookie effacé (EX-21) ET, depuis le 15/10/2026 (audit point 4), toutes les sessions du compte
 * RÉVOQUÉES côté serveur (version de session + 1) : un jeton copié ailleurs ne vaut plus rien. Best-effort — tant que la
 * migration 356 n'est pas appliquée, seul le cookie est effacé (comportement d'avant). Ne refuse jamais la déconnexion.
 */
export async function DELETE() {
  const magasin = await cookies();
  const jeton = magasin.get(NOM_COOKIE)?.value;
  const payload = jeton ? await verifierJeton(jeton) : null;
  const sub = payload ? sessionDepuisPayload(payload).sub : null;
  if (sub !== null) await revoquerSessions(sub);
  magasin.delete({ name: NOM_COOKIE, path: '/' });
  return Response.json({ ok: true });
}
