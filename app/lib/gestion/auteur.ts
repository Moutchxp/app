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

export async function auteurDeLaRequete(request: Request): Promise<Auteur> {
  const jeton = lireCookie(request, NOM_COOKIE);
  const payload = jeton ? await verifierJeton(jeton) : null;
  if (!payload) return { id: null, libelle: 'inconnu' }; // ne peut pas arriver après la garde ; repli honnête quand même
  const session = sessionDepuisPayload(payload);
  return { id: session.sub, libelle: session.identifiant ?? (session.sub === null ? 'accès de secours' : 'inconnu') };
}
