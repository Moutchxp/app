import 'server-only';
import { lireJeton } from './googleJeton';
import { lireIdentifiants, rafraichirJeton, chercherParMessageId, listerNonLus, lireEnteteGmail, modifierLibellesFil } from './google';
import { ancreDuFil, type DepsLectureGmail, type DepsMarquageGmail } from './lectureGmail';

/**
 * MODULE « GESTION » — LOT 5-BOITE-2 : CÂBLAGE RÉEL du lu/non lu Gmail. Même rôle que `depsReellesDepot` pour le
 * Drive : tenir les I/O à un seul endroit, pour que la règle (`lectureGmail.ts`) reste éprouvable sans réseau.
 *
 * 🔴 LE JETON EST CELUI DE gestion@ — le compte PARTAGÉ, celui qui possède la boîte. C'est la conséquence directe du
 * choix « un seul état commun » : le lu/non lu appartient à la boîte, pas à la personne qui la regarde. (Le Drive,
 * lui, agit au nom de l'adresse de session — ce sont deux questions différentes, et deux jetons différents.)
 *
 * ⚠️ UN JETON D'ACCÈS PAR APPEL DE PAGE, et pas de mémoire : un jeton vit une heure, le rafraîchir coûte un
 * aller-retour, et le garder en mémoire d'un processus Next qui se recharge à chaque modification de fichier
 * apporterait plus de surprises que d'économie. À revoir le jour où la boîte sera ouverte des centaines de fois
 * par heure — mesure à l'appui, pas avant.
 */
async function jetonGestion(): Promise<string | null> {
  const j = lireJeton();
  const ids = lireIdentifiants();
  if (j === null || ids === null) return null;
  const r = await rafraichirJeton({ identifiants: ids, refreshToken: j.refreshToken }, { fetch });
  return r.ok ? r.valeur : null;
}

export function depsNonLusGmail(): DepsLectureGmail {
  return {
    jeton: jetonGestion,
    lister: (jeton, plafond) => listerNonLus(jeton, { fetch }, plafond),
    entete: (jeton, id) => lireEnteteGmail(jeton, id, { fetch }),
  };
}

export function depsMarquageGmail(): DepsMarquageGmail {
  return {
    jeton: jetonGestion,
    ancre: ancreDuFil,
    chercher: (jeton, messageIdRfc) => chercherParMessageId(jeton, messageIdRfc, { fetch }),
    modifierFil: (jeton, threadId, o) => modifierLibellesFil(jeton, threadId, o, { fetch }),
  };
}

export { nonLusGmail, marquerFilGmail } from './lectureGmail';
