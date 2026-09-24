import 'server-only';
import { NOM_COOKIE, sessionDepuisPayload, verifierJeton } from '../admin/session';
import { capaciteEnvoiGestion, trouverCompteParId } from '../admin/comptes';

/**
 * LOT 5e — LA GARDE D'ENVOI : ce compte peut-il écrire AU NOM DE gestion@criterimmo.fr ?
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 RELUE EN BASE À CHAQUE ENVOI, jamais lue dans le jeton. Un jeton vit huit heures : un droit retiré à 9 h resterait
 * valable jusqu'à 17 h si l'on s'y fiait. Ici, retirer le droit coupe l'envoi au clic suivant. C'est la même règle que
 * `exigerCompteActif` — et elle compte doublement pour un geste qui parle au monde extérieur au nom de l'agence.
 *
 * 🔴 CETTE GARDE NE REMPLACE PAS `exigerCompteActif(request, 'gestion')`, elle s'y AJOUTE. La première dit « tu as
 * accès au module » ; celle-ci dit « tu as le droit d'envoyer ». Les routes d'envoi appellent les DEUX, dans cet ordre.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * 🔒 DIRECTION SÛRE DU DOUTE : tout ce qui n'est pas un « oui » explicite est un non. Session illisible, compte
 * introuvable, compte désactivé, base injoignable — dans tous ces cas, on n'envoie pas. Un droit qui envoie du courrier
 * au nom de l'agence ne s'ouvre jamais par accident (décision du lot 5-DROITS : « à décider » vaut non).
 */

/** La phrase montrée à qui n'a pas le droit. Une seule formulation, à l'écran comme dans la réponse de la route. */
export const MENTION_SANS_DROIT_ENVOI = 'Vous n’avez pas le droit d’envoyer au nom de gestion@.';

function lireCookie(request: Request, nom: string): string | null {
  const brut = request.headers.get('cookie');
  if (!brut) return null;
  for (const part of brut.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === nom) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

export async function peutEnvoyerAuNomDeGestion(request: Request): Promise<boolean> {
  const jeton = lireCookie(request, NOM_COOKIE);
  const payload = jeton ? await verifierJeton(jeton) : null;
  if (!payload) return false;
  const session = sessionDepuisPayload(payload);

  // RÈGLE D'OR du dépôt : la VOIE DE SECOURS (mot de passe partagé, `sub` nul AVEC rôle administrateur explicite) est
  //   administrateur, et ses droits sont implicites. Ne jamais dériver un refus d'un « 0 ligne » — un `WHERE id = null`
  //   enfermerait Arno dehors.
  if (session.sub === null) return session.role === 'administrateur';

  try {
    const compte = await trouverCompteParId(session.sub);
    if (!compte || !compte.actif) return false;
    return capaciteEnvoiGestion(compte);
  } catch {
    return false; // base injoignable : on n'envoie pas. Le doute ne doit jamais ouvrir cette porte-là.
  }
}

/** La réponse de refus, telle quelle. 403 : le compte est connu, c'est le DROIT qui manque — jamais un 401 trompeur. */
export function refusEnvoi(): Response {
  return Response.json({ erreur: MENTION_SANS_DROIT_ENVOI }, { status: 403 });
}
