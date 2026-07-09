import 'server-only';
import { cookies } from 'next/headers';
import { verifier, hacher } from '../../../../../lib/admin/motDePasse';
import { trouverCompteParId, changerMotDePasseSelf, permsDuCompte } from '../../../../../lib/admin/comptes';
import { NOM_COOKIE, optionsCookie, signerJeton, verifierJeton, sessionDepuisPayload } from '../../../../../lib/admin/session';
import { LONGUEUR_MIN_MOT_DE_PASSE } from '../../../../../lib/admin/politiqueMdp';

/**
 * Changement de mot de passe SELF-SERVICE (M3-4 Lot B). NAMESPACE SINGULIER `/api/admin/compte/mot-de-passe`
 * (disjoint du futur `/api/admin/comptes` pluriel, Lot C). C'est la SEULE route d'API atteignable tant que le
 * jeton porte `doitChanger=true` (whitelist du proxy) : elle doit donc rester joignable par un compte contraint.
 *
 * POST { ancien, nouveau, confirmation } :
 *  - refuse proprement la VOIE DE SECOURS (sub=null : aucun compte à modifier) — jamais un 500 ;
 *  - refuse un compte désactivé/supprimé (relecture `actif` en base — équivalent au re-check de M3-0, mais SANS
 *    permission de module : ce self-service doit marcher pour tout compte actif, y compris un collaborateur sans
 *    aucune permission ; `exigerCompteActif(module)` exigerait à tort une permission de module) ;
 *  - vérifie l'ancien mot de passe (argon2), applique la politique (longueur ≥ LONGUEUR_MIN, différent de l'ancien),
 *    hache le nouveau, abaisse `doit_changer_mot_de_passe`, journalise `changement_mot_de_passe`, et RÉÉMET un jeton
 *    frais (doitChanger=false) — sinon l'ancien jeton re-piégerait l'utilisateur. Le clair ne quitte jamais la
 *    fonction : jamais journalisé, jamais renvoyé, jamais dans une URL.
 */
export async function POST(request: Request) {
  const jeton = (await cookies()).get(NOM_COOKIE)?.value;
  const payload = jeton ? await verifierJeton(jeton) : null;
  if (!payload) return Response.json({ erreur: 'Non authentifié.' }, { status: 401 });

  const session = sessionDepuisPayload(payload);
  if (session.sub === null) {
    // Voie de secours (mot de passe partagé) : aucun compte nommé à modifier. Refus PROPRE, pas d'erreur serveur.
    return Response.json({ erreur: 'La voie de secours n’a pas de compte à modifier.' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ erreur: 'Requête invalide.' }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const ancien = typeof b.ancien === 'string' ? b.ancien : '';
  const nouveau = typeof b.nouveau === 'string' ? b.nouveau : '';
  const confirmation = typeof b.confirmation === 'string' ? b.confirmation : '';

  const compte = await trouverCompteParId(session.sub).catch(() => null);
  if (!compte || !compte.actif) {
    // Compte supprimé ou désactivé pendant la session → interdit de changer le mot de passe.
    return Response.json({ erreur: 'ACCES_REVOQUE' }, { status: 403 });
  }

  // Authentifie l'acteur pour cette opération sensible (protège une session volée sans le mot de passe courant).
  const ancienOk = await verifier(ancien, compte.mot_de_passe);
  if (!ancienOk) {
    return Response.json({ erreur: 'Mot de passe actuel incorrect.' }, { status: 400 });
  }
  // Politique (sobre) : concordance, longueur minimale, différence avec l'ancien.
  if (nouveau !== confirmation) {
    return Response.json({ erreur: 'La confirmation ne correspond pas.' }, { status: 400 });
  }
  if (nouveau.length < LONGUEUR_MIN_MOT_DE_PASSE) {
    return Response.json(
      { erreur: `Le nouveau mot de passe doit contenir au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères.` },
      { status: 400 },
    );
  }
  if (nouveau === ancien) {
    return Response.json({ erreur: 'Le nouveau mot de passe doit être différent de l’ancien.' }, { status: 400 });
  }

  const nouveauHash = await hacher(nouveau);
  await changerMotDePasseSelf(compte.id, nouveauHash);

  // Jeton frais : doitChanger=false → l'utilisateur n'est plus redirigé. Perms/role relus du compte (frais).
  const jetonFrais = await signerJeton({
    sub: compte.id,
    identifiant: compte.identifiant,
    role: compte.role,
    perms: permsDuCompte(compte),
    doitChanger: false,
  });
  (await cookies()).set(NOM_COOKIE, jetonFrais, optionsCookie(process.env.NODE_ENV === 'production'));
  return Response.json({ ok: true });
}
