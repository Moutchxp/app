import { chaineParents, chercherDossiers, nomDuDrive } from './drive';
import { racineRemontee, type SorteRacine } from './arriveeArbre';
import {
  DOSSIER_INTERDIT_LECTURE, indexerMaillons, peutCreerDossier, peutDeposer, peutJoindre, type Maillon,
} from './driveLectureFichier';
// LOT APERCU-RAPIDE — la chaîne d'un DOSSIER est mémorisée 60 s : elle est la même pour tous ses fichiers.
import { chaineDuDossierMemo, metadonneesMemo, nomDuDriveMemo } from './driveMemoire';

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
): Promise<{
  joindre: VerdictJoindre; creer: VerdictCreer; chaine: { id: string; nom: string }[];
  racine: SorteRacine | null;
}> {
  const maillons = await chaineDuDossierMemo(sujet, jeton, id, { fetch });
  const index = indexerMaillons(maillons);
  const j = peutJoindre(id, index);
  const c = peutCreerDossier(id, index);
  return {
    /**
     * ══ 🔴🔴 LOT PICTO-DRIVE-ARRIVEE-EN-ARBORESCENCE — SOUS QUELLE RACINE DU SÉLECTEUR ? ══════════════════════
     *
     * La fenêtre Drive affiche trois entrées en haut (« Mon Drive », « Drives partagés », « Partagés avec moi »),
     * et la chaîne ci-dessous ne les connaît pas : elle commence à la racine de Google, pas à la nôtre. Pour
     * arriver EN ARBORESCENCE, l'écran doit savoir laquelle de ces trois lignes déplier en premier.
     *
     * 🔴 LA RÉPONSE SE LIT SUR `driveId`, ET ELLE EST ICI PARCE QUE C'EST ICI QU'ON L'A. Les maillons portent
     * `driveId` (renseigné par l'API sur tout élément d'un Drive partagé, racine comprise) ; la chaîne rendue à
     * l'écran, elle, est réduite à `{ id, nom }`. Laisser l'écran deviner l'aurait fait deviner sur le NOM — et
     * la racine d'un Drive partagé s'appelle « Drive », celle de Mon Drive s'appelle « Mon Drive » ou « My
     * Drive » selon la langue du compte. Deux noms sur lesquels on ne peut rien fonder.
     *
     * ⚠️ AUCUN APPEL DE PLUS : ce sont les maillons qu'on vient déjà de remonter pour les deux verdicts.
     */
    racine: racineRemontee(maillons),
    joindre: j.joindre ? { joindre: true, motif: null } : { joindre: false, motif: j.motif },
    creer: c.creer ? { creer: true, motif: null } : { creer: false, motif: c.motif },
    /**
     * ══ 🔴🔴 LOT RANGER-ARBRE-2 — LA CHAÎNE EST RENDUE, ET ELLE NE COÛTE (PRESQUE) RIEN ═══════════════════════
     *
     * CONSTAT D'ARNO : « un dossier ouvert depuis “Récents” affiche “Google Drive › Drive”, sans ses parents, ce
     * qui empêche de remonter ». L'écran ne connaissait qu'un identifiant ; le chemin, lui, n'existait nulle part.
     *
     * 🔴 IL EXISTAIT POURTANT DÉJÀ, ICI MÊME. Cette fonction REMONTE toute la chaîne des parents pour rendre ses
     * deux verdicts, et la jetait ensuite. La rendre n'ajoute pas un seul appel à Google — c'est la même chaîne,
     * mémorisée, qui servait déjà à savoir si l'on est sous « Documents clients scannés ».
     *
     * ⚠️ DANS L'ORDRE DE LECTURE, du haut vers le dossier demandé — `chaineParents` remonte, l'écran descend.
     * ⚠️ UNE CHAÎNE TROUÉE (un ancêtre illisible) est rendue telle quelle : elle est alors plus courte que la
     * vérité, et l'écran garde le chemin qu'il avait. Il ne dira jamais un parent qu'on n'a pas su lire.
     */
    chaine: await nommerLaRacine(jeton, [...maillons].reverse()),
  };
}

/**
 * ══ 🔴🔴 LOT RANGER-ARBRE-2 — « Drive » N'EST LE NOM DE RIEN ═════════════════════════════════════════════════════
 *
 * Mesuré le 30/09/2026 sur le Drive du cabinet : `files.get` sur la racine d'un Drive partagé rend le mot
 * générique « Drive », jamais le nom que tout le monde lit (« GESTION LOCATIVE »). Rendre la chaîne telle quelle
 * aurait donc remplacé, dans le fil d'Ariane, un nom juste par un nom générique — c'est-à-dire aggravé le défaut
 * qu'on venait corriger. C'EST LA SECONDE MOITIÉ DU CONSTAT D'ARNO : « Google Drive › Drive ».
 *
 * ⚠️ UN SEUL APPEL DE PLUS, ET SEULEMENT QUAND LA CHAÎNE COMMENCE PAR UNE RACINE DE DRIVE PARTAGÉ (le premier
 * maillon n'a pas de parent et porte le nom générique). Dans « Mon Drive », rien n'est demandé.
 * ⚠️ ET SI L'APPEL ÉCHOUE, ON GARDE CE QU'ON A : un nom générique vaut mieux qu'un fil d'Ariane amputé.
 */
const NOM_GENERIQUE_DRIVE = 'Drive';
async function nommerLaRacine(
  jeton: string, chaine: { id: string; nom: string }[],
): Promise<{ id: string; nom: string }[]> {
  const tete = chaine[0];
  if (tete === undefined || tete.nom !== NOM_GENERIQUE_DRIVE) return chaine;
  const vrai = await nomDuDriveMemo(jeton, tete.id, (id) => nomDuDrive(jeton, id, { fetch }));
  if (vrai === null) return chaine;
  return [{ id: tete.id, nom: vrai }, ...chaine.slice(1)];
}

/**
 * ══ 🔴🔴 LOT DRIVE-UNIQUE — LE VERDICT DU RANGEMENT D'UNE PIÈCE REÇUE ════════════════════════════════════════════
 *
 * 🔴 CE QU'IL RÉPARE. Jusqu'au 29/09/2026, ranger une pièce jointe dans le Drive ne vérifiait que la NATURE de la
 * cible (`verifierCibleDepot` : un dossier, pas un regroupement, pas la corbeille) — jamais son EMPLACEMENT.
 * « Documents clients scannés » était donc une destination valide pour un dépôt, alors qu'aucun autre geste de
 * l'application n'a le droit d'y écrire. Les deux routes de dépôt passent désormais par ici.
 *
 * ⚠️ MÊME REMONTÉE ET MÊME MÉMOIRE COURTE que les autres verdicts : la chaîne du dossier visé est très souvent
 * déjà connue (la liste qui vient de s'afficher l'a payée), et le rangement ne la repaie pas.
 */
export async function verdictDeposer(
  sujet: string, jeton: string, dossierId: string,
): Promise<{ deposer: boolean; motif: string | null }> {
  const index = indexerMaillons(await chaineDuDossierMemo(sujet, jeton, dossierId, { fetch }));
  const v = peutDeposer(dossierId, index);
  return v.deposer ? { deposer: true, motif: null } : { deposer: false, motif: v.motif };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT DRIVE-DEPLACER — LE DOSSIER PROTÉGÉ, ET TOUS SES ANCÊTRES
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * LES IDENTIFIANTS QU'UN DÉPLACEMENT NE DOIT JAMAIS TOUCHER.
 *
 * 🔴 POURQUOI LES ANCÊTRES COMPTENT AUTANT QUE L'ARCHIVE ELLE-MÊME, et c'est l'interdit qu'on oublie : déplacer
 * « GESTION LOCATIVE » emporterait « Documents clients scannés » avec lui, sans qu'aucune vérification portant sur
 * l'archive ne s'en aperçoive — l'archive n'aurait pas bougé, c'est le sol sous elle qui aurait bougé.
 *
 * 🔴 ON CHERCHE PAR LE NOM, comme le fait tout le reste de la règle depuis le premier jour (`peutJoindre` compare
 * le nom des maillons). S'il existe plusieurs dossiers de ce nom, ils sont TOUS protégés, avec leurs chaînes.
 *
 * ⚠️ MÉMORISÉ 60 s, comme les chaînes de dossiers : c'est une information de SÉCURITÉ, et une mémoire longue
 * continuerait d'autoriser un déplacement après un rangement fait entre-temps.
 *
 * ⚠️ EN CAS D'ÉCHEC DE LECTURE, ON REND `null` — et l'appelant REFUSE. Ne pas savoir où est l'archive vaut
 * interdit : c'est la règle de tout le module, et une écriture n'est pas l'endroit où l'assouplir.
 */
export interface IdsProteges {
  /** Les dossiers nommés « Documents clients scannés » eux-mêmes. */
  proteges: Set<string>;
  /** Eux, PLUS tous leurs ancêtres : aucun d'eux ne se déplace. */
  protegesEtAncetres: Set<string>;
  /** Les maillons rencontrés en chemin, réutilisables par le verdict. */
  maillons: { id: string; nom: string; parentId: string | null }[];
}

const memoireProteges = new Map<string, { valeur: IdsProteges; expireA: number }>();
/** Même durée que la mémoire des chaînes : voir `driveMemoire`. C'est un choix de sécurité, pas de confort. */
export const MEMOIRE_PROTEGES_MS = 60_000;

export async function idsProteges(
  sujet: string, jeton: string, maintenant = Date.now(),
): Promise<IdsProteges | null> {
  const deja = memoireProteges.get(sujet);
  if (deja !== undefined && deja.expireA > maintenant) return deja.valeur;

  const trouves = await chercherDossiers(jeton, DOSSIER_INTERDIT_LECTURE, { fetch }, 25);
  if (!trouves.ok) return null;
  // ⚠️ `name contains` ne sait pas faire d'égalité : on filtre nous-mêmes, sur le nom exact.
  const exacts = trouves.valeur.filter((d) => d.nom.trim().toLowerCase() === DOSSIER_INTERDIT_LECTURE.toLowerCase());
  if (exacts.length === 0) return null;   // on n'a pas trouvé l'archive : on ne sait pas, donc on refusera

  const proteges = new Set<string>();
  const protegesEtAncetres = new Set<string>();
  const maillons: { id: string; nom: string; parentId: string | null }[] = [];
  for (const d of exacts) {
    proteges.add(d.id);
    const chaine = await chaineParents(jeton, d.id, { fetch });
    if (chaine.length === 0) return null;  // chaîne illisible : on ne sait pas
    for (const m of chaine) { protegesEtAncetres.add(m.id); maillons.push(m); }
  }
  const valeur: IdsProteges = { proteges, protegesEtAncetres, maillons };
  memoireProteges.set(sujet, { valeur, expireA: maintenant + MEMOIRE_PROTEGES_MS });
  return valeur;
}

/** Pour les tests, et pour une passe qui voudrait repartir à neuf. Sans effet sur le Drive. */
export function oublierLesProteges(): void { memoireProteges.clear(); }
