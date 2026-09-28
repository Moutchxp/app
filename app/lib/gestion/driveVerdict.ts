import { chaineParents } from './drive';
import { indexerMaillons, peutCreerDossier, peutJoindre } from './driveLectureFichier';

/**
 * MODULE « GESTION » — LE VERDICT « PEUT-ON JOINDRE CE FICHIER ? », EN UN SEUL ENDROIT.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LA RÈGLE QUI COMMANDE : « DOCUMENTS CLIENTS SCANNÉS » NE SE LIT JAMAIS.
 *
 * Ce dossier est l'archive historique du cabinet : pièces d'identité, avis d'imposition, relevés bancaires.
 * « Insérer un lien » ne lit RIEN et reste permis partout ; « Joindre » télécharge les OCTETS et les met dans un
 * mail qui part sur l'Internet ouvert, sans authentification, vers une adresse tapée à la main. → INTERDIT.
 *
 * 🔴 POURQUOI CE FICHIER EXISTE (lot ENVOI-ARRIERE-PLAN). Deux routes prononcent désormais ce verdict : celle qui
 * liste le Drive, et celle qui inscrit une pièce dans un brouillon. Deux copies de la règle divergeraient un jour —
 * et le jour où elles divergent, c'est un avis d'imposition qui part chez un artisan. Une seule copie, ici.
 *
 * 🔴 LE VERDICT REMONTE LA CHAÎNE DES PARENTS, il ne regarde pas le dossier immédiat : un fichier rangé douze
 * niveaux sous « Documents clients scannés » est sous « Documents clients scannés ».
 *
 * 🔒 LECTURE SEULE : `chaineParents` n'appelle que `files.get`. Pas un `files.create`, pas un `files.update`.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

export interface VerdictJoindre {
  joindre: boolean;
  /** Le motif du refus, EN TOUTES LETTRES. `null` quand c'est permis — un refus muet enverrait chercher une panne. */
  motif: string | null;
}

export interface VerdictCreer {
  creer: boolean;
  motif: string | null;
}

/**
 * LE VERDICT POUR UN ÉLÉMENT, obtenu en REMONTANT ses parents.
 *
 * ⚠️ LA DÉCISION ELLE-MÊME EST DANS UN MODULE PUR ET SANS RÉSEAU (`driveLectureFichier`) : c'est ce qui permet de
 * l'éprouver exhaustivement, ce que fait son test. Ici, on ne fait que lui fournir la chaîne réelle.
 */
export async function verdictJoindre(jeton: string, id: string): Promise<VerdictJoindre> {
  const chaine = await chaineParents(jeton, id, { fetch });
  const v = peutJoindre(id, indexerMaillons(chaine));
  return v.joindre ? { joindre: true, motif: null } : { joindre: false, motif: v.motif };
}

/**
 * ══ 🔴 LOT DRIVE-VISUALISER-ET-DOSSIERS — LE VERDICT DE CRÉATION, pour un DOSSIER. ═══════════════════════════════
 *
 * Même remontée, même règle, autre geste : rien ne se crée sous « Documents clients scannés », à aucune profondeur.
 */
export async function verdictCreer(jeton: string, parentId: string): Promise<VerdictCreer> {
  const chaine = await chaineParents(jeton, parentId, { fetch });
  const v = peutCreerDossier(parentId, indexerMaillons(chaine));
  return v.creer ? { creer: true, motif: null } : { creer: false, motif: v.motif };
}

/**
 * ══ 🔴 LES DEUX VERDICTS D'UN COUP, SUR UNE SEULE REMONTÉE. ══════════════════════════════════════════════════════
 *
 * 🔴 POURQUOI ILS VOYAGENT ENSEMBLE. L'écran du sélecteur a besoin des deux pour le dossier qu'il affiche : peut-on
 * y joindre, peut-on y créer. Les demander séparément remonterait DEUX FOIS la même chaîne de parents — c'est-à-dire
 * jusqu'à vingt-six `files.get` au lieu de treize pour afficher une page, sur une arborescence qui fait treize
 * niveaux (mesuré le 25/09/2026). Le réseau est la seule chose coûteuse ici ; la règle, elle, est gratuite.
 */
export async function verdictsDossier(
  jeton: string, id: string,
): Promise<{ joindre: VerdictJoindre; creer: VerdictCreer }> {
  const index = indexerMaillons(await chaineParents(jeton, id, { fetch }));
  const j = peutJoindre(id, index);
  const c = peutCreerDossier(id, index);
  return {
    joindre: j.joindre ? { joindre: true, motif: null } : { joindre: false, motif: j.motif },
    creer: c.creer ? { creer: true, motif: null } : { creer: false, motif: c.motif },
  };
}
