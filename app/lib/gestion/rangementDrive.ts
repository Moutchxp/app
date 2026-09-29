import type { Chemin, Colonne } from './finderDrive';

/**
 * LOT DRIVE-UNIQUE — LES RÈGLES DU MODE « RANGER » ET DE L'ARBORESCENCE COMPACTE. Module PUR.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE QUE DEMANDE ARNO, DANS SES MOTS : « il faut uniformiser l'utilisation du Drive avec les derniers outils
 * mis en place, et l'appliquer aussi quand on reçoit un mail avec des pièces jointes à envoyer dans le Drive. Je
 * veux le même système que la fenêtre Drive façon Finder, partout où on y fait appel, avec l'ouverture d'une
 * modale. Quand on ouvre un dossier, il se déploie sous lui, ses pièces et sous-dossiers s'affichent, le
 * déploiement décale mécaniquement les dossiers autour, mais ces derniers restent toujours visibles. On peut ainsi
 * saisir un document dans un dossier ouvert et le glisser-déposer dans un dossier voisin : on crée simplement une
 * arborescence, structurée et minimaliste, qui prend le moins de place possible. L'idéal serait de pouvoir
 * glisser-déposer à 2 strates en amont ou en aval du dossier ouvert. Garder aussi les dossiers récents déjà codés. »
 *
 * 🔴 UNE FENÊTRE, DEUX USAGES. Le même composant sert à JOINDRE (depuis l'éditeur de mail) et à RANGER (depuis un
 * mail reçu). Ce qui change tient en trois choses : ce qu'on tient dans la main gauche (des pièces à ranger plutôt
 * qu'un message à remplir), ce que fait un dépôt, et le mot du bouton. Tout le reste — l'arbre, le glisser, la
 * mémoire tampon, l'aperçu, les refus — est rigoureusement identique, et c'est tout l'intérêt : on n'apprend le
 * Drive qu'une fois.
 *
 * 🔴 POURQUOI CES RÈGLES VIVENT ICI. Décider quelles colonnes on montre, combien de parents tient le bandeau, ce
 * qu'on écrit quand une pièce est rangée, ce qui reste à ranger : ce sont des décisions, elles se rejouent sans
 * navigateur, et elles se prouvent.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LES DEUX USAGES DE LA FENÊTRE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * `joindre` = depuis l'éditeur de mail : on PREND des fichiers du Drive pour les mettre dans un message.
 * `ranger`  = depuis un mail reçu : on POSE des pièces reçues dans un dossier du Drive.
 *
 * ⚠️ LES DEUX SENS SONT OPPOSÉS, et c'est la seule chose qu'il faut garder en tête en lisant l'écran : en mode
 * `joindre` la fenêtre est une SOURCE, en mode `ranger` elle est une DESTINATION.
 */
export type ModeDrive = 'joindre' | 'ranger';

/**
 * Une pièce reçue, en attente de rangement. Ce que l'écran affiche dans le panneau « À ranger ».
 *
 * ⚠️ TAILLE ET TYPE PEUVENT MANQUER, et c'est le cas réel : une pièce capturée d'un message mal formé n'a parfois
 * ni l'un ni l'autre. Les rendre obligatoires ici obligerait l'appelant à inventer un zéro — et l'écran dirait
 * alors « 0 o » d'un fichier qui pèse trois mégaoctets.
 */
export interface PieceARanger {
  pieceId: number;
  nom: string;
  tailleOctets: number | null;
  typeMime: string | null;
}

/** Où une pièce a atterri, une fois rangée. */
export interface Rangee {
  dossierId: string;
  dossierNom: string;
  /** Le lien Drive, quand Google l'a rendu : il permet d'aller voir. `null` = rangée, mais sans adresse à ouvrir. */
  lien: string | null;
}

/**
 * 🔴 LE TYPE MIME DU GLISSER D'UNE PIÈCE REÇUE, distinct de celui des fichiers du Drive.
 *
 * ⚠️ POURQUOI DEUX TYPES ET NON UN SEUL AVEC UN CHAMP « SORTE » : ce qui les sépare n'est pas une nuance, c'est
 * l'opération. Déposer un fichier du Drive sur un dossier le DÉPLACE ; déposer une pièce reçue le COPIE depuis la
 * boîte mail, par une tout autre route, avec un tout autre journal. Deux types MIME rendent la confusion
 * impossible : une zone qui n'accepte que l'un ne verra jamais l'autre, même par erreur de programmation.
 */
export const MIME_PIECE = 'application/x-svv-piece';

/** Le mot d'une pièce rangée. PUR. */
export function motRangee(dossierNom: string): string {
  return `✓ Rangée dans « ${dossierNom} »`;
}

/**
 * CE QU'IL RESTE À FAIRE, en une phrase. PUR.
 *
 * ⚠️ ON COMPTE CE QUI RESTE, PAS CE QUI EST FAIT : c'est la question qu'on se pose en regardant le panneau. Et
 * quand tout est rangé, on le dit — un panneau qui se vide sans rien dire se lit comme une perte.
 */
export function resumeARanger(total: number, rangees: number): string {
  if (total === 0) return 'Aucune pièce à ranger dans ce message.';
  const reste = Math.max(0, total - rangees);
  if (reste === 0) {
    return total > 1
      ? `Les ${total} pièces sont rangées. Vous pouvez en ranger une ailleurs, ou fermer.`
      : 'La pièce est rangée. Vous pouvez la ranger ailleurs, ou fermer.';
  }
  return reste > 1 ? `${reste} pièces à ranger` : '1 pièce à ranger';
}

/**
 * LE TITRE DE LA FENÊTRE selon l'usage. PUR.
 *
 * ⚠️ EN MODE RANGER, LE TITRE NE DIT PAS LE DOSSIER COURANT mais ce qu'on est en train de faire : on ouvre cette
 * fenêtre en tenant des pièces, et l'endroit où l'on est change dix fois avant qu'on les pose. C'est l'inverse du
 * mode JOINDRE, où l'on est venu chercher quelque chose et où savoir où l'on est EST la question.
 */
export function titreFenetre(mode: ModeDrive, nomCourant: string, nbPieces: number): string {
  if (mode === 'joindre') return nomCourant;
  return nbPieces > 1 ? `Ranger ${nbPieces} pièces dans le Drive` : 'Ranger une pièce dans le Drive';
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② LE BANDEAU DES PARENTS — deux crans en amont, et pas plus
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * 🔴 DEUX PARENTS, PAS TREIZE. Arno : « un BANDEAU DES PARENTS montre les 2 dossiers parents, ex. “Base de données
 * locative › 1 Propriétaires › CHARPENTIER” ». Le Drive du cabinet fait treize niveaux : un fil d'Ariane complet
 * passe à la ligne, mange trois rangées de l'écran et cesse d'être lisible exactement là où il servirait.
 *
 * ⚠️ CE QUI EST AU-DESSUS N'EST PAS PERDU : il est COMPTÉ (« … »), et l'écran en fait un bouton qui déplie le
 * chemin entier. Masquer sans compter ferait croire qu'on est à la racine.
 */
export const PARENTS_VISIBLES = 2;

export interface PasDuBandeau {
  id: string;
  nom: string;
  /** L'indice dans le chemin complet : c'est lui qu'on donne à « remonter », jamais la position affichée. */
  index: number;
}

export interface BandeauParents {
  /** Combien de crans sont cachés au-dessus. 0 = le chemin tient entier. */
  caches: number;
  /** Les deux parents puis le dossier courant, dans l'ordre de lecture. */
  pas: PasDuBandeau[];
}

/**
 * LE BANDEAU, À PARTIR DU CHEMIN COMPLET. PUR.
 *
 * ⚠️ `index` EST L'INDICE DANS LE CHEMIN COMPLET, et c'est capital : le bandeau n'affiche que la fin, mais cliquer
 * sur « 1 Propriétaires » doit remonter au VRAI cran, pas au deuxième de ce qu'on voit.
 */
export function bandeauParents(chemin: Chemin, visibles = PARENTS_VISIBLES): BandeauParents {
  const pas = chemin.map((e, i) => ({ id: e.id, nom: e.nom, index: i + 1 }));
  const garde = visibles + 1;
  if (pas.length <= garde) return { caches: 0, pas };
  return { caches: pas.length - garde, pas: pas.slice(pas.length - garde) };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ LES COLONNES — le moins de place possible, par défaut
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * 🔴 PAR DÉFAUT : NOM ET TAILLE. Arno : « Par défaut, pour gagner de la place, Nom + Taille seulement, avec un
 * bouton pour afficher les autres colonnes. » Dans une fenêtre où l'on veut voir trois dossiers ouverts à la fois,
 * deux colonnes de métadonnées valent trois lignes d'arborescence.
 *
 * ⚠️ LE TRI SUR UNE COLONNE CACHÉE RESTE POSSIBLE, et il le reste exprès : on peut trier par date, puis replier les
 * colonnes pour gagner la place, sans perdre l'ordre qu'on venait d'obtenir.
 */
export const COLONNES_COMPACTES: Colonne[] = ['nom', 'taille'];

export function colonnesVisibles(compact: boolean, toutes: readonly Colonne[]): Colonne[] {
  return compact ? toutes.filter((c) => COLONNES_COMPACTES.includes(c)) : [...toutes];
}

/** Le mot du bouton qui ouvre ou ferme les colonnes. PUR. */
export function motColonnes(compact: boolean): string {
  return compact ? 'Afficher les colonnes' : 'Masquer les colonnes';
}

/**
 * LA GRILLE CSS DES LIGNES, selon les colonnes montrées. PUR.
 *
 * ⚠️ ELLE EST CALCULÉE ICI ET NON ÉCRITE DANS LE CSS : l'en-tête et les lignes doivent porter EXACTEMENT la même
 * grille, sinon les colonnes ne sont pas alignées. Une seule source, deux emplois.
 */
export function grilleColonnes(colonnes: readonly Colonne[]): string {
  const largeur: Record<Colonne, string> = {
    nom: 'minmax(0,1fr)', modifie: '11rem', taille: '5.5rem', type: '8rem',
  };
  return colonnes.map((c) => largeur[c]).join(' ');
}
