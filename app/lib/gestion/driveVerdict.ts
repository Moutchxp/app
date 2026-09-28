import { chaineParents } from './drive';
import { indexerMaillons, peutCreerDossier, peutJoindre, type Maillon } from './driveLectureFichier';
// LOT APERCU-RAPIDE — la chaîne d'un DOSSIER est mémorisée 60 s : elle est la même pour tous ses fichiers.
import { chaineDuDossierMemo, metadonneesMemo } from './driveMemoire';

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
 *
 * ═══ 🔴 LOT APERCU-RAPIDE — LA RÈGLE N'A PAS BOUGÉ, SON PRIX SI ═══════════════════════════════════════════════════
 * Mesuré le 29/09/2026 : remonter la chaîne coûtait 1 700 à 2 360 ms, soit 6 à 7 `files.get` EN SÉRIE, repayés
 * INTÉGRALEMENT à chaque fichier du même dossier. C'était la moitié des cinq secondes d'ouverture d'un aperçu.
 *
 * `verdictJoindreFichier` coupe cela en deux temps : UN `files.get` pour le fichier (qui donne son parent), puis la
 * chaîne du DOSSIER, mémorisée 60 s et partagée par tous ses fichiers — et déjà calculée par la liste qui vient de
 * s'afficher. Le verdict lui-même est exactement le même module pur, sur exactement les mêmes maillons.
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
 * ══ 🔴🔴 LOT APERCU-RAPIDE — LE VERDICT POUR UN FICHIER, EN DEUX TEMPS ET SANS RIEN CHANGER À LA RÈGLE ═══════════
 *
 * ① UN `files.get` sur le fichier : il donne son nom, son type, sa taille, sa vignette ET son parent. Mémorisé.
 * ② LA CHAÎNE DU PARENT, mémorisée par dossier — donc gratuite dès le deuxième fichier du même dossier.
 *
 * 🔴 LES MAILLONS SOUMIS AU MODULE PUR SONT LES MÊMES QU'AVANT : le fichier, puis ses ancêtres. `peutJoindre`
 * remonte depuis le fichier exactement comme auparavant, et refuse pareillement quand la chaîne est trouée — un
 * dossier dont on n'a pas su lire les ancêtres ne rend pas une chaîne complète, donc rien n'est mémorisé et le
 * verdict reste « je ne sais pas », c'est-à-dire « interdit ».
 *
 * ⚠️ ELLE REND AUSSI LES MÉTADONNÉES. La route en a besoin juste après (type, taille, vignette) : les rendre ici
 * évite le `files.get` supplémentaire qu'elle faisait — 270 à 440 ms mesurés, pour redemander ce qu'on venait
 * d'obtenir.
 */
export async function verdictJoindreFichier(
  sujet: string, jeton: string, id: string,
): Promise<{ verdict: VerdictJoindre; meta: Awaited<ReturnType<typeof metadonneesMemo>> }> {
  const meta = await metadonneesMemo(sujet, jeton, id, { fetch });
  if (!meta.ok) {
    // On n'a pas su lire le fichier : on ne peut RIEN affirmer de son emplacement, donc on refuse.
    return {
      verdict: { joindre: false, motif: 'Emplacement inconnu : par précaution, seul le lien est proposé.' },
      meta,
    };
  }
  const parent = meta.valeur.parents[0] ?? null;
  const ancetres: Maillon[] = parent === null
    ? []
    : await chaineDuDossierMemo(sujet, jeton, parent, { fetch });
  const index = indexerMaillons([
    { id, nom: meta.valeur.nom, parentId: parent },
    ...ancetres,
  ]);
  const v = peutJoindre(id, index);
  return {
    verdict: v.joindre ? { joindre: true, motif: null } : { joindre: false, motif: v.motif },
    meta,
  };
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
 *
 * ⚠️ LOT APERCU-RAPIDE — ELLE PASSE PAR LA MÉMOIRE COURTE, et c'est ce qui rend l'aperçu instantané : la chaîne
 * qu'elle calcule en affichant la liste d'un dossier est EXACTEMENT celle dont l'aperçu d'un de ses fichiers aura
 * besoin une seconde plus tard. Le travail est fait une fois, au moment où l'on regardait déjà ailleurs.
 */
export async function verdictsDossier(
  sujet: string, jeton: string, id: string,
): Promise<{ joindre: VerdictJoindre; creer: VerdictCreer }> {
  const index = indexerMaillons(await chaineDuDossierMemo(sujet, jeton, id, { fetch }));
  const j = peutJoindre(id, index);
  const c = peutCreerDossier(id, index);
  return {
    joindre: j.joindre ? { joindre: true, motif: null } : { joindre: false, motif: j.motif },
    creer: c.creer ? { creer: true, motif: null } : { creer: false, motif: c.motif },
  };
}
