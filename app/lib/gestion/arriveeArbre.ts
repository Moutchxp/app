import { RACINE_DRIVES_PARTAGES, RACINE_MON_DRIVE } from './cibleDepot';

/**
 * ══ 🔴🔴 LOT PICTO-DRIVE-ARRIVEE-EN-ARBORESCENCE — ARRIVER EN VOYANT OÙ L'ON EST. Module PUR ═════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (03/10/2026), fil 36669 / message 57427, « test gigout.pdf » : « un clic sur le picto vert “Dans
 * le Drive” ouvre la fenêtre Drive À L'INTÉRIEUR du dossier qui contient le document. On ne voit pas où l'on se
 * trouve dans l'arborescence. Je veux arriver en VUE ARBORESCENCE : la racine visible avec les autres dossiers de
 * même niveau repliés ; chaque dossier ancêtre DÉPLIÉ jusqu'à celui qui contient le document, ses autres
 * sous-dossiers visibles et repliés ; le document SURLIGNÉ et la liste défilée jusqu'à lui, centré. »
 *
 * ═══ 🔴🔴 CE QUE CE MODULE RÉPOND, ET POURQUOI IL EST SÉPARÉ DU RESTE ════════════════════════════════════════════
 *
 * Deux questions, et aucune des deux n'a besoin du réseau une fois la chaîne des parents connue :
 *
 *   ① SOUS QUELLE RACINE DU SÉLECTEUR CE DOCUMENT VIT-IL ? La fenêtre affiche trois entrées en haut (« Mon
 *      Drive », « Drives partagés », « Partagés avec moi »), et un chemin remonté par Google ne les connaît pas.
 *      Sans cette réponse, on ne sait pas quelle ligne déplier en premier — c'est-à-dire par où entrer.
 *
 *   ② QUELS DOSSIERS DÉPLIER, ET JUSQU'À QUELLE PROFONDEUR ? La réponse est le chemin complet, de la racine du
 *      sélecteur jusqu'au dossier qui contient le document.
 *
 * ═══ 🔴🔴 LE PIÈGE MESURÉ, ET C'EST LUI QUI A DICTÉ LA FORME DE CE MODULE ════════════════════════════════════════
 *
 * « Mon Drive » porte DEUX identifiants, et ils ne sont pas interchangeables :
 *
 *   · le sélecteur affiche la ligne « Mon Drive » sous l'identifiant `root` — le mot de Google, celui que l'API
 *     accepte tel quel comme parent (voir `cibleDepot`) ;
 *   · mais `chaineParents` remonte de parent en parent par `files.get`, et le dernier maillon rendu porte
 *     l'identifiant RÉEL du dossier racine (`0AK…`), parce que c'est ce que Google écrit dans `parents`.
 *
 * Déplier naïvement l'identifiant de la chaîne n'aurait donc RIEN ouvert : aucune ligne de la liste ne porte cet
 * identifiant-là. Le défaut aurait été silencieux — un arbre qui s'ouvre sur la racine et ne descend jamais — et
 * il n'aurait touché QUE « Mon Drive », c'est-à-dire pas les Drives partagés où vit la quasi-totalité des
 * documents du cabinet. Autrement dit : invisible aux essais, et faux chez la seule personne qui range dans son
 * propre Drive. `arriveeArbre` réécrit donc la tête du chemin, et un test le fixe.
 *
 * ═══ ⚠️ CE MODULE NE DEVINE RIEN : IL LIT `driveId` ═══════════════════════════════════════════════════════════════
 *
 * La sorte de racine se DÉDUIT des maillons, elle ne s'infère pas du nom. Le nom de la racine de « Mon Drive » est
 * rendu par Google dans la langue du compte (« Mon Drive », « My Drive »), et celui d'une racine de Drive partagé
 * est le mot générique « Drive » (mesuré le 30/09/2026, voir `nommerLaRacine`). Deux noms sur lesquels on ne peut
 * rien fonder. `driveId`, lui, est renseigné par l'API sur TOUT élément d'un Drive partagé, racine comprise, et
 * absent dans « Mon Drive ».
 *
 * ⚠️ ET UNE CHAÎNE TROUÉE SE DIT TELLE QUELLE (`null`). `chaineParents` s'arrête au premier `files.get` refusé :
 * un ancêtre illisible rend donc une chaîne PLUS COURTE que la vérité, dont la tête porte encore un `parentId`.
 * Conclure « Mon Drive » dans ce cas aurait déplié une branche fausse avec l'aplomb d'une branche juste. On
 * préfère le dire, et la fenêtre ouvre alors au plus profond qu'elle peut atteindre (règle d'Arno).
 *
 * 🔒 AUCUN `fetch`, AUCUN SQL, AUCUN REACT : ce module NOMME et il CALCULE. Il est donc importable depuis un
 * composant `'use client'` sans rien tirer derrière lui — la règle du dépôt depuis l'incident du 24/09/2026.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * COMMENT LA FENÊTRE ARRIVE. `'dossier'` est le défaut historique : on se pose DANS le dossier. `'arborescence'`
 * part de la racine du sélecteur et déplie la branche jusqu'au document — le mode d'arrivée par le picto vert.
 *
 * ⚠️ IL VIT ICI, et non dans le composant, pour la même raison que `ModeDrive` vit dans `rangementDrive` : c'est
 * un mot du domaine, et les tests du câblage doivent pouvoir le nommer sans importer un fichier `'use client'`.
 */
export type ArriveeDrive = 'dossier' | 'arborescence';

/** Les deux racines du sélecteur sous lesquelles un chemin peut être déplié. */
export type SorteRacine = 'mon_drive' | 'drive_partage';

/** Un maillon tel que `chaineParents` le rend : du bas vers le haut. */
export interface MaillonRemonte {
  id: string;
  nom: string;
  parentId: string | null;
  /** Renseigné par l'API sur tout élément d'un Drive partagé, racine comprise. Absent dans « Mon Drive ». */
  driveId?: string | null;
}

/** Le libellé des deux racines, tel que la liste du sélecteur les écrit — il doit dire le MÊME mot. */
const NOM_MON_DRIVE = 'Mon Drive';
const NOM_DRIVES_PARTAGES = 'Drives partagés';

/**
 * ══ 🔴🔴 SOUS QUELLE RACINE DU SÉLECTEUR CETTE CHAÎNE VIT-ELLE ? PUR ════════════════════════════════════════════
 *
 * Les maillons arrivent du BAS vers le HAUT (`chaineParents`). La réponse se lit sur le dernier.
 *
 * 🔴 `null` QUAND ON N'A PAS SU REMONTER JUSQU'EN HAUT, et c'est le cas qui compte : la tête porte encore un
 * `parentId`, donc il existait un cran au-dessus qu'on n'a pas pu lire (droits, élément supprimé, borne atteinte).
 * C'est exactement ce qui arrive sous « Partagés avec moi » : le dossier qu'on nous a partagé a un parent chez son
 * propriétaire, que `files.get` nous refuse. On ne saurait pas quelle ligne déplier, et on le dit.
 */
export function racineRemontee(maillons: readonly MaillonRemonte[]): SorteRacine | null {
  const tete = maillons.at(-1);
  if (tete === undefined) return null;
  if ((tete.parentId ?? '').trim() !== '') return null;
  return (tete.driveId ?? '').trim() !== '' ? 'drive_partage' : 'mon_drive';
}

/** Une étape du chemin déplié, telle que la liste du sélecteur la porte. */
export interface EtapeArbre { id: string; nom: string }

export interface ArriveeArbre {
  /**
   * Le chemin COMPLET, de la racine du sélecteur jusqu'au dossier qui contient le document. C'est lui qu'on
   * affiche, et c'est aussi la liste des dossiers à déplier : chacun doit être ouvert pour que le suivant paraisse.
   */
  chemin: readonly EtapeArbre[];
  /**
   * La profondeur à laquelle la LIGNE DU DOCUMENT se trouve dans l'arbre affiché — la racine étant à 0. Elle sert
   * à desserrer la borne de profondeur de l'aplatissement, qui sinon couperait la branche avant son bout.
   */
  profondeurDocument: number;
}

/**
 * ══ 🔴🔴 LE CHEMIN À DÉPLIER, DE LA RACINE DU SÉLECTEUR AU DOSSIER DU DOCUMENT. PUR ══════════════════════════════
 *
 * `chaine` arrive du HAUT vers le BAS, telle que la route la rend (`verdictsDossier`), et s'arrête au dossier qui
 * contient le document.
 *
 * 🔴 DEUX RÉÉCRITURES, ET CHACUNE RÉPARE UN DÉFAUT PRÉCIS :
 *
 *   · DRIVE PARTAGÉ — on PRÉFIXE « Drives partagés ». La racine du Drive partagé (« Test ») n'est pas une ligne de
 *     la racine du sélecteur : elle est un ENFANT du regroupement. Sans ce cran, on déplierait « Test » sans avoir
 *     ouvert ce qui le contient, et la branche resterait invisible. C'est aussi ce cran qui fait paraître
 *     « Catherine, COMPTABILITE, Direction, GESTION LOCATIVE… » repliés à côté — ce qu'Arno demande nommément.
 *
 *   · MON DRIVE — on REMPLACE la tête par `root`. Voir l'encadré du module : la chaîne porte l'identifiant réel du
 *     dossier racine, la liste affiche `root`. Le nom, lui, est repris de la liste (« Mon Drive ») et non de
 *     Google, qui le rend dans la langue du compte.
 *
 * ⚠️ `null` QUAND ON NE SAIT PAS PAR OÙ ENTRER : racine indéterminée, ou chaîne vide. L'appelant ouvre alors
 * directement dans le dossier, avec un message — « pas d'écran vide » (règle d'Arno).
 */
export function arriveeArbre(
  chaine: readonly EtapeArbre[], racine: SorteRacine | null,
): ArriveeArbre | null {
  if (racine === null || chaine.length === 0) return null;
  const chemin: EtapeArbre[] = racine === 'drive_partage'
    ? [{ id: RACINE_DRIVES_PARTAGES, nom: NOM_DRIVES_PARTAGES }, ...chaine]
    : [{ id: RACINE_MON_DRIVE, nom: NOM_MON_DRIVE }, ...chaine.slice(1)];
  /* Le document est une ligne de plus que son dossier : la racine est à 0, le dossier à chemin.length - 1. */
  return { chemin, profondeurDocument: chemin.length };
}

/**
 * ══ 🔴🔴 JUSQU'OÙ A-T-ON RÉELLEMENT PU DESCENDRE ? PUR ══════════════════════════════════════════════════════════
 *
 * RÈGLE D'ARNO : « si un ancêtre n'est pas accessible ou si le fichier n'existe plus, ouvre au niveau le plus
 * profond qu'on peut atteindre, avec un message clair. Pas d'écran vide. »
 *
 * 🔴 ON S'ARRÊTE AU PREMIER TROU, ET PAS AU DERNIER SUCCÈS. Un dossier dont on n'a pas lu le contenu ne peut pas
 * montrer le suivant : garder les crans d'après aurait marqué des dossiers « ouverts » sous lesquels il n'y a
 * rien — exactement le défaut du 29/09/2026 (état déplié sans contenu), qui obligeait à cliquer deux fois.
 */
export function brancheAtteignable(
  chemin: readonly EtapeArbre[], lus: ReadonlySet<string>,
): { atteints: readonly EtapeArbre[]; premierManquant: EtapeArbre | null } {
  const atteints: EtapeArbre[] = [];
  for (const e of chemin) {
    if (!lus.has(e.id)) return { atteints, premierManquant: e };
    atteints.push(e);
  }
  return { atteints, premierManquant: null };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LES MOTS — un écran qui n'a pas pu tout déplier doit le DIRE, et dire quoi
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Le chemin, écrit avec le séparateur de la fenêtre. PUR. */
export function cheminEcrit(chemin: readonly EtapeArbre[]): string {
  return chemin.map((e) => e.nom).join(' › ');
}

/** L'étiquette du bandeau de chemin. Le mot dit DE QUOI c'est le chemin — pas « où l'on est ». */
export const MOT_CHEMIN_DOCUMENT = 'Ce document est ici';

/**
 * ⚠️ TROIS MESSAGES, ET PAS UN SEUL « ça n'a pas marché ». Les trois situations se réparent différemment : un
 * ancêtre refusé est une question de DROITS, un document absent est un déplacement, et une chaîne irremontable
 * est un chemin qu'on ne sait pas situer. Les confondre ferait chercher la panne au mauvais endroit.
 */
export function messageAncetreInaccessible(nom: string): string {
  return `L’arborescence n’a pas pu être dépliée entièrement : « ${nom} » n’est pas accessible. `
    + 'La fenêtre s’ouvre au niveau le plus profond atteint.';
}

export function messageDocumentAbsent(nomDossier: string): string {
  return `Ce document n’est plus dans « ${nomDossier} ». L’arborescence est dépliée jusqu’à ce dossier.`;
}

export function messageRacineInconnue(nomDossier: string | null): string {
  const ou = nomDossier === null ? 'le dossier qui le contient' : `« ${nomDossier} »`;
  return `Le chemin complet de ce document n’a pas pu être reconstitué jusqu’à la racine. `
    + `La fenêtre s’ouvre directement dans ${ou}.`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LE DÉFILEMENT — « la liste défile automatiquement jusqu'à lui, CENTRÉ »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * LE DÉFILEMENT QUI CENTRE UNE LIGNE. PUR.
 *
 * 🔴 IL FAUT UN CALCUL, ET NON `scrollIntoView` : la liste est VIRTUALISÉE (`fenetreVisible`). La ligne visée
 * n'existe pas encore dans le document tant qu'on n'a pas défilé jusqu'à elle — il n'y a donc aucun élément sur
 * lequel appeler `scrollIntoView`. Le centre se déduit de l'indice et de la hauteur de ligne, qui sont connus.
 *
 * ⚠️ BORNÉ AUX DEUX EXTRÉMITÉS : un document en tête ne peut pas être centré (il n'y a rien au-dessus de la
 * première ligne), et un document en queue se colle au bas. Sans ces bornes on demanderait un défilement négatif
 * ou au-delà du contenu — que le navigateur ramène silencieusement, en laissant la ligne ailleurs qu'au centre.
 */
export function defilementPourCentrer(
  index: number, nombreLignes: number, hauteurVue: number, hauteurLigne: number,
): number {
  if (index < 0 || hauteurLigne <= 0) return 0;
  const centre = index * hauteurLigne + hauteurLigne / 2 - hauteurVue / 2;
  const maximum = Math.max(0, nombreLignes * hauteurLigne - hauteurVue);
  return Math.round(Math.min(Math.max(0, centre), maximum));
}
