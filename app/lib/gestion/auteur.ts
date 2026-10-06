import 'server-only';
import { NOM_COOKIE, sessionDepuisPayload, verifierJeton } from '../admin/session';
import type { Auteur } from './gestes';

/**
 * MODULE « GESTION » — QUI A FAIT LE GESTE, pour le journal.
 *
 * ⚠️ CE FICHIER N'AUTORISE RIEN. L'autorisation est faite — et relue EN BASE — par `exigerCompteActif(request,'gestion')`,
 * appelée AVANT lui dans chaque route. Ici on ne fait que LIRE l'identité déjà validée, pour l'écrire dans le journal.
 * Confondre les deux serait un piège : un jeton signé mais révoqué donnerait un nom sans donner un droit.
 *
 * Le LIBELLÉ est toujours écrit, même pour la voie de secours (mot de passe partagé, `sub` nul) : un journal qui dirait
 * « auteur inconnu » ne servirait à rien, et « accès de secours » est une information en soi.
 */
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

/**
 * ══ 🔴🔴 LOT VIGNETTE-EVENEMENT, POINT 3 — LA CLÉ D'UN COLLABORATEUR ═════════════════════════════════════════════
 *
 * Arno : « L'effet reste PAR COLLABORATEUR […] Il ne s'éteint pas chez un autre collaborateur. »
 *
 * 🔴 ÉCRITE UNE SEULE FOIS, ICI. Deux endroits qui fabriqueraient cette clé finiraient par ne plus désigner la
 * même personne — et l'effet s'éteindrait chez l'un sans s'éteindre chez l'autre, ce qui est exactement le
 * défaut qu'Arno veut éviter.
 *
 * ⚠️ L'IDENTIFIANT DE CONNEXION, ET NON L'IDENTIFIANT NUMÉRIQUE : la voie de secours (mot de passe partagé) n'a
 * pas de compte, et elle doit pouvoir éteindre son propre effet. Le libellé, lui, est TOUJOURS écrit — c'est la
 * règle de ce fichier depuis le lot 4.
 *
 * ⚠️ AUCUNE DONNÉE PERSONNELLE : c'est l'identifiant déjà écrit dans le journal de gestion, pas un nom.
 */
export function cleCollaborateur(auteur: Auteur): string {
  const net = auteur.libelle.trim();
  return net === '' ? 'inconnu' : net;
}

export async function auteurDeLaRequete(request: Request): Promise<Auteur> {
  const jeton = lireCookie(request, NOM_COOKIE);
  const payload = jeton ? await verifierJeton(jeton) : null;
  if (!payload) return { id: null, libelle: 'inconnu' }; // ne peut pas arriver après la garde ; repli honnête quand même
  const session = sessionDepuisPayload(payload);
  return { id: session.sub, libelle: session.identifiant ?? (session.sub === null ? 'accès de secours' : 'inconnu') };
}
