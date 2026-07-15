import 'server-only';
import { cookies } from 'next/headers';
import { NOM_COOKIE, verifierJeton, sessionDepuisPayload } from '../../../../../lib/admin/session';
import { trouverCompteParId, enregistrerOrdreModules } from '../../../../../lib/admin/comptes';
import { validerOrdreModules } from '../../../../admin/(protected)/menuAdmin';

/**
 * Ordre personnalisé des modules — SELF-SERVICE (M4). NAMESPACE SINGULIER `/api/admin/compte/ordre-modules`
 * (comme `/api/admin/compte/mot-de-passe` : le compte CONNECTÉ agit sur SA propre donnée ; disjoint du pluriel
 * `/api/admin/comptes/[id]/…` = « admin gère les autres »). Calqué sur la route mot-de-passe : lecture de session
 * par cookie, 401 si non authentifié, refus PROPRE de la voie de secours, relecture `actif` en base (defense in
 * depth), réponse `{ ok: true }`.
 *
 * POST body = un TABLEAU JSON de slugs de modules (ex. ["/admin/curation","/admin/pilotage",…]). Validé par
 * `validerOrdreModules` (tableau de slugs CONNUS, dédupliqué, borné) — un corps non conforme → 400, on n'écrit
 * jamais de déchet. SCOPE STRICT : l'UPDATE cible `WHERE id = <sub du jeton>`, JAMAIS un id du corps (garde IDOR).
 *
 * ⚠️ ATTEINTE PROXY : `proxy.ts` (gelé) garde `/api/admin/:path*` en FAIL-CLOSED. Ce chemin n'est NI dans
 * PERMISSIONS NI dans `CHEMINS_AUTHENTIFIE_SEUL` → il passe pour un ADMINISTRATEUR mais un COLLABORATEUR reçoit un
 * 403 du proxy AVANT d'atteindre cette route. Pour que les collaborateurs puissent aussi réordonner, il faut
 * ajouter `'/api/admin/compte/ordre-modules'` à `CHEMINS_AUTHENTIFIE_SEUL` (proxy.ts) — fichier gelé, décision
 * d'Arno (voir compte rendu). La route se re-garde de toute façon en aval (session + `actif`).
 */
export async function POST(request: Request) {
  const jeton = (await cookies()).get(NOM_COOKIE)?.value;
  const payload = jeton ? await verifierJeton(jeton) : null;
  if (!payload) return Response.json({ erreur: 'Non authentifié.' }, { status: 401 });

  const session = sessionDepuisPayload(payload);
  if (session.sub === null) {
    // Voie de secours (mot de passe partagé) : aucune ligne compte → rien à stocker. Refus PROPRE (pas un 500) ;
    // l'ordre par défaut reste (D3). On ne bloque rien d'autre, on n'invente aucun compte.
    return Response.json({ erreur: 'La voie de secours n’a pas de compte à personnaliser.' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ erreur: 'Requête invalide.' }, { status: 400 });
  }

  const ordre = validerOrdreModules(body);
  if (ordre === null) {
    return Response.json({ erreur: 'Ordre invalide : un tableau de slugs de modules connus est attendu.' }, { status: 400 });
  }

  const compte = await trouverCompteParId(session.sub).catch(() => null);
  if (!compte || !compte.actif) {
    // Compte supprimé/désactivé pendant la session → aucune écriture (équivalent au re-check M3-0, sans perm de module).
    return Response.json({ erreur: 'ACCES_REVOQUE' }, { status: 403 });
  }

  await enregistrerOrdreModules(session.sub, ordre); // SCOPE STRICT : sub du jeton uniquement, jamais un id du corps
  return Response.json({ ok: true });
}
