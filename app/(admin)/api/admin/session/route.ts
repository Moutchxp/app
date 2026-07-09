import 'server-only';
import { cookies } from 'next/headers';
import { motDePasseValide } from '../../../../lib/admin/password';
import { verifier } from '../../../../lib/admin/motDePasse';
import { trouverCompte, marquerConnexion, permsDuCompte } from '../../../../lib/admin/comptes';
import { NOM_COOKIE, optionsCookie, signerJeton, permsToutes, type SessionAdmin } from '../../../../lib/admin/session';

/** Hash argon2id de leurre (d'une valeur jetable) : sert au `verifier` de TEMPS CONSTANT quand l'identifiant est
 *  inconnu — l'échec ne révèle alors ni l'existence du compte ni la longueur du mot de passe. */
const HASH_LEURRE = '$argon2id$v=19$m=65536,t=3,p=4$fRN8sFhfdFcpDqG1etqwZg$NodI9TfeUYxTcZ55B9tt3bHe3KcoraiozK7Fta5ukrk';

/** Réponse d'échec UNIQUE et générique (EX-20) : ne révèle jamais si c'est l'identifiant, le mot de passe, ou
 *  l'état actif/inactif qui est en cause. */
function echec(): Response {
  return Response.json({ erreur: 'Identifiants invalides' }, { status: 401 });
}

/**
 * Ouverture de session : POST { identifiant?, password }.
 *  - Identifiant renseigné → compte nommé de `admin_utilisateur` (refusé si `actif=false`).
 *  - Identifiant vide/absent → VOIE DE SECOURS (ancien mot de passe partagé), session administrateur, sub=null.
 * Anti-force-brute : le hachage argon2 impose un délai naturel ; un `verifier` de leurre est exécuté même quand
 * l'identifiant est inconnu (temps constant). Pas de rate-limit ici (cf. rapport). Message d'échec toujours générique.
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

  let session: SessionAdmin;

  if (identifiant === '') {
    // ═══ VOIE DE SECOURS — à retirer au lot M3-5 après bascule ═══
    // Mot de passe partagé (app/lib/admin/password.ts) → accès administrateur complet, compte anonyme (sub=null).
    if (!motDePasseValide(password)) return echec();
    session = { sub: null, identifiant: null, role: 'administrateur', perms: permsToutes(), doitChanger: false };
    // ═══ FIN VOIE DE SECOURS ═══
  } else {
    // Voie NOMMÉE : compte de admin_utilisateur. Verify TOUJOURS exécuté (hash réel si trouvé, leurre sinon) →
    // temps constant, aucune fuite d'existence/état ; tous les cas d'échec renvoient le message générique.
    const compte = await trouverCompte(identifiant).catch(() => null);
    const hash = compte?.mot_de_passe ?? HASH_LEURRE;
    const motOk = await verifier(password, hash);
    if (!compte || !compte.actif || !motOk) return echec();
    await marquerConnexion(compte.id);
    session = {
      sub: compte.id,
      identifiant: compte.identifiant,
      role: compte.role,
      perms: permsDuCompte(compte),
      doitChanger: compte.doit_changer_mot_de_passe, // M3-4 Lot B : le drapeau entre dans le JWS
    };
  }

  const jeton = await signerJeton(session);
  (await cookies()).set(NOM_COOKIE, jeton, optionsCookie(process.env.NODE_ENV === 'production'));
  return Response.json({ ok: true });
}

/** Déconnexion : DELETE → cookie effacé (EX-21). */
export async function DELETE() {
  (await cookies()).delete({ name: NOM_COOKIE, path: '/' });
  return Response.json({ ok: true });
}
