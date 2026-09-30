import { RACINE_DRIVES_PARTAGES, RACINE_MON_DRIVE } from './cibleDepot';

/**
 * LOT DRIVE-FACON-FINDER — LES RÈGLES DU NAVIGATEUR DRIVE, EN PRÉSENTATION LISTE. Module PUR.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE QUE DEMANDE ARNO, DANS SES MOTS : « la navigation dans notre Drive custom est beaucoup trop différente,
 * en esthétique et en fonctionnalités, de celle du Drive Google. Il faut dupliquer son esthétique et ses fonctions
 * principales pour que l'internaute ne soit pas déstabilisé en passant d'un environnement à l'autre, et privilégier
 * la réactivité maximale au clic. » Son modèle : Google Drive pour Mac dans le Finder, en présentation LISTE.
 *
 * 🔴 POURQUOI TOUT CELA VIT ICI, ET PAS DANS L'ÉCRAN. Trier, choisir une icône, décider ce qu'un Cmd+clic ajoute ou
 * retire, dire quelles entrées un menu contextuel a le droit de porter : ce sont des DÉCISIONS. Elles se rejouent
 * sans navigateur, elles se prouvent, et — pour le menu contextuel — elles portent une règle de sécurité qu'on ne
 * veut surtout pas voir vivre au milieu du JSX.
 *
 * 🔴🔴 LA RÈGLE QUI NE SE DISCUTE PAS : l'application ne RENOMME pas, ne SUPPRIME pas, ne met pas à la CORBEILLE et
 * ne PARTAGE pas. Ces gestes n'existent nulle part dans le code du module, et le menu contextuel ne peut pas les
 * porter : `ACTIONS_JAMAIS` les nomme, et un test les cherche un par un — dans les menus ET dans ce source.
 *
 * ⚠️ 29/09/2026 (lot DRIVE-DEPLACER) : DÉPLACER et COPIER ont quitté cette liste, sur décision d'Arno. Voir
 * l'encadré d'`ACTIONS_JAMAIS`, qui dit ce qui a changé et surtout ce qui n'a pas changé.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Une entrée de liste, telle que la route la rend. Le strict nécessaire pour trier et afficher. */
export interface EntreeDrive {
  id: string;
  nom: string;
  typeMime: string;
  tailleOctets: number | null;
  modifieLe: string | null;
  lien: string | null;
  dossier: boolean;
  parentId?: string | null;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LES COLONNES ET LE TRI
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export type Colonne = 'nom' | 'modifie' | 'taille' | 'type';
export type SensTri = 'asc' | 'desc';
export interface Tri { colonne: Colonne; sens: SensTri }

/** Les quatre colonnes du Finder, dans l'ordre du Finder. */
export const COLONNES: { cle: Colonne; libelle: string }[] = [
  { cle: 'nom', libelle: 'Nom' },
  { cle: 'modifie', libelle: 'Date de modification' },
  { cle: 'taille', libelle: 'Taille' },
  { cle: 'type', libelle: 'Type' },
];

/** Le tri d'ouverture : par nom, croissant — celui du Finder. */
export const TRI_DEFAUT: Tri = { colonne: 'nom', sens: 'asc' };

/**
 * CE QUE FAIT UN CLIC SUR UN EN-TÊTE. PUR.
 *
 * ⚠️ RECLIQUER LA MÊME COLONNE INVERSE ; en changer repart en croissant. C'est le comportement du Finder, et c'est
 * le seul qui ne surprenne pas : passer de « Nom ▲ » à « Taille ▼ » sans l'avoir demandé ferait croire à un bug.
 */
export function triSuivant(actuel: Tri, colonne: Colonne): Tri {
  if (actuel.colonne !== colonne) return { colonne, sens: 'asc' };
  return { colonne, sens: actuel.sens === 'asc' ? 'desc' : 'asc' };
}

/** La flèche à afficher dans l'en-tête. Chaîne vide = cette colonne ne porte pas le tri. PUR. */
export function flecheTri(colonne: Colonne, tri: Tri): string {
  if (tri.colonne !== colonne) return '';
  return tri.sens === 'asc' ? '▲' : '▼';
}

/**
 * TRIE UNE LISTE. PUR — la liste reçue n'est jamais modifiée sur place.
 *
 * 🔴 LES DOSSIERS RESTENT EN TÊTE, QUEL QUE SOIT LE TRI (demande d'Arno : « dossiers en tête »). C'est le réglage
 * « Conserver les dossiers en haut » du Finder, et il vaut pour les quatre colonnes — pas seulement pour le nom :
 * trier par taille en dispersant les dossiers (qui n'ont pas de taille) au milieu des fichiers rendrait la liste
 * inutilisable là où elle sert le plus, dans les dossiers qui en contiennent trois cents.
 *
 * ⚠️ LE NOM DÉPARTAGE TOUJOURS, en dernier ressort. Sans cela, trois fichiers sans date ni taille changeraient de
 * place d'un affichage à l'autre — un tri instable fait « sauter » des lignes sous le doigt.
 *
 * ⚠️ COMPARAISON DE NOMS « À LA FINDER » : insensible à la casse et aux accents, et les NOMBRES se comparent comme
 * des nombres (`Photo 2` avant `Photo 10`). Sans cela « 10 Travaux » se rangeait avant « 2 Travaux », ce qui est
 * exactement ce qu'on reproche à un tri de fichiers.
 */
export function trier(entrees: readonly EntreeDrive[], tri: Tri): EntreeDrive[] {
  const signe = tri.sens === 'asc' ? 1 : -1;
  return [...entrees].sort((a, b) => {
    if (a.dossier !== b.dossier) return a.dossier ? -1 : 1;
    const n = comparerSelon(a, b, tri.colonne) * signe;
    return n !== 0 ? n : comparerNoms(a.nom, b.nom);
  });
}

function comparerSelon(a: EntreeDrive, b: EntreeDrive, colonne: Colonne): number {
  if (colonne === 'nom') return comparerNoms(a.nom, b.nom);
  if (colonne === 'modifie') return (a.modifieLe ?? '').localeCompare(b.modifieLe ?? '');
  if (colonne === 'taille') return (a.tailleOctets ?? -1) - (b.tailleOctets ?? -1);
  return motType(a).localeCompare(motType(b), 'fr');
}

const COLLATEUR = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });
/** Deux noms de fichiers, comparés comme le Finder les compare. PUR. */
export function comparerNoms(a: string, b: string): number {
  return COLLATEUR.compare(a, b);
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② LES TYPES : UNE ICÔNE ET UN MOT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export type SorteEntree =
  | 'dossier' | 'pdf' | 'word' | 'excel' | 'powerpoint' | 'image' | 'texte'
  | 'archive' | 'audio' | 'video' | 'google_doc' | 'google_feuille' | 'google_presentation' | 'autre';

/**
 * DE QUEL TYPE EST CETTE ENTRÉE ? PUR.
 *
 * ⚠️ ON LIT LE TYPE MIME, jamais l'extension du nom : un « .pdf » renommé en « .txt » reste un PDF pour Google, et
 * c'est le type que la route nous donne qui décide de ce que l'aperçu saura faire.
 */
export function sorteEntree(e: { typeMime: string; dossier: boolean }): SorteEntree {
  if (e.dossier) return 'dossier';
  const t = (e.typeMime || '').toLowerCase().split(';')[0].trim();
  if (t === 'application/vnd.google-apps.folder') return 'dossier';
  if (t === 'application/pdf') return 'pdf';
  if (t === 'application/vnd.google-apps.document') return 'google_doc';
  if (t === 'application/vnd.google-apps.spreadsheet') return 'google_feuille';
  if (t === 'application/vnd.google-apps.presentation') return 'google_presentation';
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('audio/')) return 'audio';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('text/')) return 'texte';
  if (/wordprocessingml|msword|opendocument\.text/.test(t)) return 'word';
  if (/spreadsheetml|ms-excel|opendocument\.spreadsheet/.test(t)) return 'excel';
  if (/presentationml|ms-powerpoint|opendocument\.presentation/.test(t)) return 'powerpoint';
  if (/zip|x-tar|x-7z|x-rar|gzip/.test(t)) return 'archive';
  return 'autre';
}

/**
 * L'ICÔNE. Des emoji, et c'est délibéré : ils sont lisibles partout, ne pèsent rien, et ne demandent pas d'aller
 * chercher un jeu d'icônes chez quelqu'un d'autre. Elles sont TOUJOURS doublées d'un mot dans la colonne « Type ».
 */
export const ICONE_SORTE: Record<SorteEntree, string> = {
  dossier: '📁', pdf: '📕', word: '📘', excel: '📗', powerpoint: '📙', image: '🖼️', texte: '📄',
  archive: '🗜️', audio: '🎵', video: '🎬',
  google_doc: '📝', google_feuille: '📊', google_presentation: '📽️', autre: '📄',
};

const MOTS_SORTE: Record<SorteEntree, string> = {
  dossier: 'Dossier', pdf: 'Document PDF', word: 'Document Word', excel: 'Classeur Excel',
  powerpoint: 'Présentation PowerPoint', image: 'Image', texte: 'Texte', archive: 'Archive',
  audio: 'Audio', video: 'Vidéo',
  google_doc: 'Document Google', google_feuille: 'Feuille Google', google_presentation: 'Présentation Google',
  autre: 'Document',
};

/** Le mot de la colonne « Type ». PUR. */
export function motType(e: { typeMime: string; dossier: boolean }): string {
  return MOTS_SORTE[sorteEntree(e)];
}

/** L'icône d'une entrée. PUR. */
export function iconeEntree(e: { typeMime: string; dossier: boolean }): string {
  return ICONE_SORTE[sorteEntree(e)];
}

/**
 * LA DATE DE MODIFICATION, ÉCRITE COMME LE FINDER L'ÉCRIT : « 12 sept. 2026 à 14:03 ». PUR.
 * Chaîne vide quand Drive ne la donne pas (les deux regroupements, les Drives partagés) : une date inventée serait
 * pire qu'une case vide.
 */
export function dateFinder(iso: string | null, langue = 'fr-FR'): string {
  if (iso === null || iso.trim() === '') return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const jour = d.toLocaleDateString(langue, { day: 'numeric', month: 'short', year: 'numeric' });
  const heure = d.toLocaleTimeString(langue, { hour: '2-digit', minute: '2-digit' });
  return `${jour} à ${heure}`;
}

/**
 * LA TAILLE, ÉCRITE COMME LE FINDER L'ÉCRIT. PUR.
 * ⚠️ UN DOSSIER N'A PAS DE TAILLE, et le Finder écrit « -- ». Écrire « 0 o » ferait croire à un dossier vide.
 */
export function tailleFinder(octets: number | null, dossier: boolean): string {
  if (dossier) return '--';
  if (octets === null) return '--';
  if (octets < 1000) return `${octets} o`;
  const unites = ['Ko', 'Mo', 'Go', 'To'];
  let n = octets / 1000;
  let i = 0;
  while (n >= 1000 && i < unites.length - 1) { n /= 1000; i += 1; }
  return `${n < 10 ? n.toFixed(1).replace('.', ',') : Math.round(n)} ${unites[i]}`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ L'HISTORIQUE DE NAVIGATION — les flèches ‹ › du Finder
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Un endroit : le chemin complet, du haut jusqu'au dossier courant. `[]` = la racine du sélecteur. */
export type Chemin = readonly { id: string; nom: string }[];

export interface Historique {
  /** Les endroits visités, dans l'ordre. Jamais vide : il contient au moins la racine. */
  pile: Chemin[];
  /** Où l'on est dans cette pile. */
  position: number;
}

export const HISTORIQUE_DEPART: Historique = { pile: [[]], position: 0 };

/**
 * ALLER QUELQUE PART. PUR.
 *
 * ⚠️ ON COUPE CE QUI ÉTAIT « DEVANT ». C'est le comportement de tous les navigateurs : reculer puis partir
 * ailleurs abandonne la branche qu'on avait quittée. La garder ferait avancer vers un endroit dont on vient de se
 * détourner.
 *
 * ⚠️ ALLER LÀ OÙ L'ON EST DÉJÀ N'EMPILE RIEN : recliquer le même dossier ne doit pas remplir l'historique de
 * doublons qu'il faudrait ensuite traverser un par un.
 */
export function naviguerVers(h: Historique, chemin: Chemin): Historique {
  if (memeChemin(h.pile[h.position] ?? [], chemin)) return h;
  const pile = [...h.pile.slice(0, h.position + 1), chemin];
  return { pile, position: pile.length - 1 };
}

export function peutReculer(h: Historique): boolean { return h.position > 0; }
export function peutAvancer(h: Historique): boolean { return h.position < h.pile.length - 1; }
export function reculer(h: Historique): Historique {
  return peutReculer(h) ? { ...h, position: h.position - 1 } : h;
}
export function avancer(h: Historique): Historique {
  return peutAvancer(h) ? { ...h, position: h.position + 1 } : h;
}
/** Où l'on est. PUR. */
export function cheminCourant(h: Historique): Chemin { return h.pile[h.position] ?? []; }

export function memeChemin(a: Chemin, b: Chemin): boolean {
  return a.length === b.length && a.every((x, i) => x.id === b[i].id);
}

/** L'identifiant du dossier courant. Chaîne vide = la racine du sélecteur. PUR. */
export function dossierDuChemin(c: Chemin): string { return c.at(-1)?.id ?? ''; }

/**
 * ══ 🔴🔴 LOT RANGER-ARBRE-2 — RÉÉCRIRE L'ENDROIT OÙ L'ON EST, SANS BOUGER ════════════════════════════════════════
 *
 * CONSTAT D'ARNO, sur sa propre copie : « un dossier ouvert depuis “Récents” affiche “Google Drive › Drive”, sans
 * ses parents, ce qui empêche de remonter ».
 *
 * 🔴 POURQUOI C'ARRIVE. Un raccourci (Récents, Dossier du bien, un résultat de recherche) ne connaît qu'UN
 * identifiant : on y va donc par un chemin d'UN SEUL cran, `[{ id, nom }]`. Le fil d'Ariane dit alors la vérité
 * qu'il connaît — et cette vérité est trop courte pour qu'on puisse remonter d'un niveau, puisqu'au-dessus il n'y
 * a que la racine.
 *
 * 🔴 CE QUE FAIT CETTE FONCTION. Quand le serveur rend enfin la VRAIE chaîne des parents du dossier affiché, on
 * REMPLACE l'endroit courant de l'historique par le chemin complet — sans empiler un pas de plus : on n'a pas
 * navigué, on a simplement appris où l'on était. ⚠️ Empiler ferait qu'un « Précédent » ramènerait au même dossier
 * sous son nom court, ce qui donnerait à la flèche l'air d'être cassée.
 *
 * ⚠️ ON NE REMPLACE QUE CE QUI DÉSIGNE LE MÊME ENDROIT : le dernier cran doit porter le même identifiant. Une
 * réponse en retard, arrivée après qu'on a changé de dossier, ne doit JAMAIS réécrire l'endroit où l'on est
 * maintenant — c'est la même règle que le rafraîchissement silencieux des listings.
 */
export function remplacerCheminCourant(h: Historique, chemin: Chemin): Historique {
  const actuel = cheminCourant(h);
  if (dossierDuChemin(actuel) === '' || dossierDuChemin(actuel) !== dossierDuChemin(chemin)) return h;
  if (memeChemin(actuel, chemin)) return h;
  const pile = [...h.pile];
  pile[h.position] = chemin;
  return { ...h, pile };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ LA BARRE LATÉRALE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export type SorteLaterale = 'bien' | 'recents' | 'mon_drive' | 'drives_partages';

export interface EntreeLaterale {
  sorte: SorteLaterale;
  libelle: string;
  icone: string;
  /** Où mène le clic. `null` = ce n'est pas un dossier (Récents). */
  chemin: Chemin | null;
  /** Précision sous le libellé (le bien, pour le dossier du bien). */
  detail?: string | null;
}

/**
 * LES ENTRÉES DE LA BARRE LATÉRALE, DANS L'ORDRE DEMANDÉ PAR ARNO. PUR.
 *
 * 🔴 « Dossier du bien » EN PREMIER, et seulement quand le mail est rattaché : c'est là qu'on va neuf fois sur dix
 * en répondant à un mail déjà classé. Absent, la barre commence par « Récents » — rien ne manque, rien ne ment.
 */
export function entreesLaterales(
  dossiersDuBien: readonly { dossierId: string; dossierNom: string; libelle: string; titre: string }[],
): EntreeLaterale[] {
  const out: EntreeLaterale[] = dossiersDuBien.map((d) => ({
    sorte: 'bien' as const,
    libelle: d.titre,
    icone: '🏠',
    chemin: [{ id: d.dossierId, nom: d.dossierNom || d.libelle }],
    detail: d.libelle,
  }));
  out.push({ sorte: 'recents', libelle: 'Récents', icone: '🕘', chemin: null });
  out.push({ sorte: 'mon_drive', libelle: 'Mon Drive', icone: '💾', chemin: [{ id: RACINE_MON_DRIVE, nom: 'Mon Drive' }] });
  out.push({
    sorte: 'drives_partages', libelle: 'Drives partagés', icone: '👥',
    chemin: [{ id: RACINE_DRIVES_PARTAGES, nom: 'Drives partagés' }],
  });
  return out;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ LA SÉLECTION — Cmd+clic, Maj+clic, flèches
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export interface Selection {
  /** Ce qui est sélectionné, dans l'ordre où l'utilisateur l'a pris. */
  ids: string[];
  /** L'ANCRE d'un Maj+clic : la ligne d'où part l'intervalle. `null` = aucune. */
  ancre: string | null;
}

export const SELECTION_VIDE: Selection = { ids: [], ancre: null };

/**
 * CE QU'UN CLIC FAIT DE LA SÉLECTION. PUR.
 *
 * · clic nu        → cette ligne, et elle seule ;
 * · Cmd (ou Ctrl)  → ajoute ou retire cette ligne, sans toucher au reste ;
 * · Maj            → tout l'intervalle depuis l'ancre, comme dans le Finder.
 *
 * ⚠️ L'ANCRE NE BOUGE PAS SUR UN MAJ+CLIC : c'est ce qui permet d'élargir puis de rétrécir l'intervalle sans
 * repartir de zéro. Elle ne se déplace qu'au clic nu et au Cmd+clic.
 */
export function cliquerLigne(
  sel: Selection, id: string, ordre: readonly string[],
  touches: { cmd?: boolean; maj?: boolean } = {},
): Selection {
  if (touches.maj === true && sel.ancre !== null) {
    const i = ordre.indexOf(sel.ancre);
    const j = ordre.indexOf(id);
    if (i >= 0 && j >= 0) {
      const [a, b] = i <= j ? [i, j] : [j, i];
      return { ids: ordre.slice(a, b + 1), ancre: sel.ancre };
    }
  }
  if (touches.cmd === true) {
    const dedans = sel.ids.includes(id);
    return { ids: dedans ? sel.ids.filter((x) => x !== id) : [...sel.ids, id], ancre: id };
  }
  return { ids: [id], ancre: id };
}

/**
 * LES FLÈCHES ↑ ↓ : LA SÉLECTION SUIVANTE, d'une seule ligne. PUR.
 *
 * ⚠️ LE NOM DIT « SUIVANTE », ET PAS « DÉPLACER ». Ce n'est pas un scrupule de style : la garde qui cherche
 * les actions interdites (renommer, déplacer, supprimer…) dans ce fichier tombait sur ce nom et signalait une
 * faute qui n'existait pas. Un garde-fou qu'on apprend à ignorer ne garde plus rien.
 *
 * ⚠️ ON NE BOUCLE PAS : en haut, la flèche haute ne fait rien ; en bas, la flèche basse non plus. Une liste qui
 * reboucle fait perdre le compte de ce qu'on a parcouru — même raison que pour « Précédent / Suivant » de l'aperçu.
 */
export function selectionSuivante(sel: Selection, ordre: readonly string[], pas: -1 | 1): Selection {
  if (ordre.length === 0) return SELECTION_VIDE;
  const actuel = sel.ids.at(-1) ?? null;
  const i = actuel === null ? -1 : ordre.indexOf(actuel);
  if (i < 0) return { ids: [ordre[pas === 1 ? 0 : ordre.length - 1]], ancre: ordre[pas === 1 ? 0 : ordre.length - 1] };
  const j = Math.min(ordre.length - 1, Math.max(0, i + pas));
  return { ids: [ordre[j]], ancre: ordre[j] };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑥ 🔴🔴 LE MENU CONTEXTUEL — UNIQUEMENT LES ACTIONS QUE L'APPLICATION SAIT FAIRE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export type ActionMenu =
  'visualiser' | 'joindre' | 'lien' | 'ouvrir' | 'nouveau_dossier' | 'ouvrir_google'
  | 'couper' | 'copier' | 'coller' | 'actualiser';

export interface EntreeMenu {
  action: ActionMenu;
  libelle: string;
  /** `null` = l'entrée est active. Sinon, elle est présentée éteinte AVEC ce motif : un refus se dit. */
  motifInactif: string | null;
}

/**
 * ══ 🔴🔴 CE QUE LE MENU N'AURA JAMAIS ═══════════════════════════════════════════════════════════════════════════
 *
 * Écrit ici, en toutes lettres, et vérifié par un test qui les cherche une par une, dans les deux menus et dans
 * toutes leurs combinaisons de droits : l'application ne RENOMME pas, ne SUPPRIME pas, ne met pas à la CORBEILLE
 * et ne PARTAGE pas. Aucune de ces fonctions n'existe dans le code ; le menu ne peut donc pas les offrir, et
 * personne ne doit pouvoir les y ajouter par distraction.
 *
 * ⚠️ 29/09/2026 — CETTE LISTE A ÉTÉ RÉÉCRITE, PAS AFFAIBLIE PAR COMMODITÉ. Elle contenait aussi « deplacer »,
 * « copier » et « dupliquer », parce qu'au lot DRIVE-FACON-FINDER l'application ne savait faire NI l'un NI l'autre.
 * Décision d'Arno du 29/09/2026 (lot DRIVE-DEPLACER) : elle peut désormais DÉPLACER et COPIER — donc l'interdit de
 * ces deux mots-là tombe, et il tombe ICI, dans un diff qu'on relit, et non par un test qu'on contourne.
 *
 * 🔴 CE QUI N'A PAS BOUGÉ D'UN MOT : supprimer, renommer, corbeille, partager. Ce sont les gestes IRRÉVERSIBLES ou
 * qui exposent les documents du cabinet à des tiers ; ils restent hors de cette application, et un déplacement se
 * défait (le bandeau « Annuler », et le journal qui garde le parent d'origine) là où une suppression ne se défait
 * pas. « dupliquer » est retiré de la liste des MOTS cherchés, mais reste absent du menu : Drive appelle ainsi la
 * copie SUR PLACE, et ce lot n'a jamais copié que VERS un dossier désigné.
 */
export const ACTIONS_JAMAIS = [
  'renommer', 'corbeille', 'supprimer', 'partager',
] as const;

/**
 * LES DROITS DU COUPER / COPIER / COLLER, tels que le menu doit les présenter.
 *
 * ⚠️ AUCUNE RÈGLE N'EST CALCULÉE ICI. Ce module dit ce qu'on AFFICHE ; c'est la route qui prononce le verdict, en
 * remontant les chaînes de parents chez Google. Un menu actif ne promet donc rien — il ouvre une demande.
 */
export interface DroitsPresse {
  /** Le geste est-il possible du tout ? (sans le journal en base : non, et le motif le dit.) */
  autorise: boolean;
  motif: string | null;
  /** Le libellé de « Coller », déjà composé (il annonce déplacement ou copie, et le nombre). */
  motColler: string;
  /** Rien dans la mémoire tampon : « Coller » est éteint, avec le geste à faire d'abord. */
  presseVide: boolean;
}

/** Les trois entrées de la mémoire tampon, identiques sur un fichier et sur un dossier. PUR. */
export function entreesPresse(m: DroitsPresse | null): EntreeMenu[] {
  if (m === null) return [];
  const empeche = m.autorise ? null : (m.motif ?? 'Ce geste est indisponible ici.');
  return [
    { action: 'couper', libelle: 'Couper', motifInactif: empeche },
    { action: 'copier', libelle: 'Copier', motifInactif: empeche },
    {
      action: 'coller',
      libelle: m.motColler,
      motifInactif: empeche ?? (m.presseVide ? 'Rien à coller : coupez (⌘X) ou copiez (⌘C) d’abord.' : null),
    },
  ];
}

/**
 * LE MENU D'UN FICHIER. PUR.
 *
 * 🔴🔴 SOUS « DOCUMENTS CLIENTS SCANNÉS », « Visualiser » ET « Joindre » SONT ÉTEINTS, AVEC LEUR MOTIF. Ce n'est
 * pas une politesse : afficher un avis d'imposition à l'écran, c'est le LIRE, et c'est la lecture du contenu que
 * la règle interdit. « Insérer un lien » reste, lui, parce qu'il ne lit rien — il pose une adresse, et c'est
 * Google qui appliquera ses droits au destinataire.
 *
 * ⚠️ ÉTEINTES ET NON ABSENTES, ici seulement : dans un menu qui s'ouvre sur une ligne précise, une entrée absente
 * se lit comme un oubli, alors qu'une entrée éteinte avec son motif se lit comme une règle. (Dans la LISTE, au
 * contraire, le bouton n'existe pas : le motif y est affiché une fois pour toutes, en tête.)
 */
export function menuFichier(o: {
  joindreAutorise: boolean;
  motifRefus: string | null;
  dejaAjoute: boolean;
  avecLien: boolean;
  /** `null` (ou absent) = ce menu ne propose pas la mémoire tampon du tout. */
  presse?: DroitsPresse | null;
}): EntreeMenu[] {
  const refus = o.motifRefus ?? 'La lecture du contenu est refusée ici.';
  return [
    {
      action: 'visualiser',
      libelle: 'Visualiser',
      /**
       * ⚠️ « Visualiser » RESTE ACTIF même sur un format sans aperçu, et ce n'est pas un oubli : c'est l'écran
       * d'aperçu qui le DIT, sans même interroger le serveur, et qui propose alors de joindre. L'éteindre ici
       * retirerait ce chemin — et la règle du lot est que rien n'est retiré.
       */
      motifInactif: !o.joindreAutorise ? refus : null,
    },
    {
      action: 'joindre',
      libelle: o.dejaAjoute ? 'Déjà joint au message' : 'Joindre au message',
      motifInactif: !o.joindreAutorise ? refus : o.dejaAjoute ? 'Cette pièce est déjà jointe.' : null,
    },
    {
      action: 'lien',
      libelle: 'Insérer un lien',
      motifInactif: o.avecLien ? null : 'Ce fichier n’a pas d’adresse Drive partageable.',
    },
    {
      action: 'ouvrir_google',
      libelle: 'Ouvrir dans Google Drive',
      motifInactif: o.avecLien ? null : 'Ce fichier n’a pas d’adresse Drive.',
    },
    /**
     * ⚠️ « Coller » EXISTE AUSSI SUR UN FICHIER, et ce n'est pas une inattention : on vise le dossier AFFICHÉ, celui
     * qui contient cette ligne. C'est le geste du Finder — on ne va pas chercher une zone vide pour coller.
     */
    ...entreesPresse(o.presse ?? null),
  ];
}

/**
 * LE MENU D'UN DOSSIER. PUR.
 *
 * ⚠️ « Nouveau dossier » PORTE LES MÊMES INTERDITS QU'AILLEURS : il est éteint, avec son motif, partout où la
 * création est refusée — à commencer par « Documents clients scannés » et tous ses sous-dossiers.
 */
export function menuDossier(o: {
  creerAutorise: boolean;
  motifCreation: string | null;
  avecLien: boolean;
  /** `null` (ou absent) = ce menu ne propose pas la mémoire tampon du tout. */
  presse?: DroitsPresse | null;
}): EntreeMenu[] {
  return [
    { action: 'ouvrir', libelle: 'Ouvrir', motifInactif: null },
    {
      action: 'nouveau_dossier',
      libelle: 'Nouveau dossier',
      motifInactif: o.creerAutorise ? null : (o.motifCreation ?? 'La création est refusée ici.'),
    },
    {
      action: 'ouvrir_google',
      libelle: 'Ouvrir dans Google Drive',
      motifInactif: o.avecLien ? null : 'Ce dossier n’a pas d’adresse Drive.',
    },
    // 🔴 SUR UN DOSSIER, « Coller ici » VISE CE DOSSIER-LÀ, pas celui qu'on regarde : c'est toute la différence.
    ...entreesPresse(o.presse ?? null),
  ];
}

/**
 * ══ 🔴 LOT DRIVE-RETOUCHES-1 — LE MENU DU VIDE ══════════════════════════════════════════════════════════════════
 *
 * Arno : « clic droit dans une ZONE VIDE de la liste : aujourd'hui c'est le menu de Chrome qui s'ouvre. Remplace-le
 * par NOTRE menu : “Nouveau dossier” (dans le dossier affiché), “Coller ici” (si la mémoire tampon contient quelque
 * chose), “Actualiser”. »
 *
 * 🔴 POURQUOI C'EST PLUS QU'UN CONFORT. Le menu de Chrome propose « Recharger », « Enregistrer sous », « Inspecter » :
 * trois gestes qui n'ont aucun sens dans une fenêtre de Drive, et dont le premier RECHARGE TOUTE L'APPLICATION —
 * fermant la fenêtre, perdant la sélection, la mémoire tampon et le brouillon en cours. Le remplacer n'est pas
 * décoratif : c'est retirer un piège.
 *
 * ⚠️ « Nouveau dossier » Y PORTE LES MÊMES INTERDITS QU'AILLEURS : éteint avec son motif partout où la création est
 * refusée — à commencer par « Documents clients scannés » et tous ses sous-dossiers.
 */
export function menuVide(o: {
  creerAutorise: boolean;
  motifCreation: string | null;
  presse?: DroitsPresse | null;
}): EntreeMenu[] {
  return [
    {
      action: 'nouveau_dossier',
      libelle: 'Nouveau dossier',
      motifInactif: o.creerAutorise ? null : (o.motifCreation ?? 'La création est refusée ici.'),
    },
    /* ⚠️ « Coller ici » N'EST LÀ QUE S'IL Y A QUELQUE CHOSE À COLLER (demande d'Arno : « si la mémoire tampon
       contient quelque chose »). Sur une LIGNE, l'entrée reste visible mais éteinte — un menu qui s'ouvre sur un
       élément précis doit montrer tout ce qu'on peut lui faire. Dans le VIDE, il n'y a rien à décrire : une
       entrée morte n'y apprendrait rien, elle allongerait la liste. */
    ...(o.presse != null && !o.presse.presseVide
      ? entreesPresse(o.presse).filter((e) => e.action === 'coller')
      : []),
    /**
     * ⚠️ « Actualiser » RELIT LE DOSSIER, il ne recharge pas la page. C'est précisément ce que le menu de Chrome
     * ne savait pas faire, et la raison pour laquelle cette entrée existe : offrir le geste qu'on cherchait, sans
     * celui qui emporte tout.
     */
    { action: 'actualiser', libelle: 'Actualiser ce dossier', motifInactif: null },
  ];
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑦ LE DÉPLIAGE SUR PLACE — le triangle ▸ du Finder
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Une ligne de la liste aplatie : l'entrée, sa profondeur d'indentation, et le dossier qui la CONTIENT. */
export interface LigneAplatie {
  entree: EntreeDrive;
  profondeur: number;
  /**
   * 🔴 LOT RANGER-ARBRE-2 — LE DOSSIER PARENT DE CETTE LIGNE. `null` au premier niveau : le parent est alors le
   * dossier AFFICHÉ, que l'aplatissement ne connaît pas (il ne voit que son contenu).
   *
   * 🔴 POURQUOI IL FALLAIT L'AJOUTER. Sans lui, une ligne dépliée ne savait pas d'où elle venait : lâcher une
   * pièce sur un fichier affiché SOUS un dossier déplié visait « le dossier affiché », c'est-à-dire un tout
   * autre endroit que celui qu'on avait sous les yeux. Voir `cibleDeDepot`.
   */
  parent: { id: string; nom: string } | null;
}

/**
 * APLATIT UN ARBRE PARTIELLEMENT DÉPLIÉ. PUR.
 *
 * 🔴 LE DÉPLIAGE SE FAIT SUR PLACE (demande d'Arno) : le triangle ▸ ouvre le sous-niveau INDENTÉ, sous la ligne du
 * dossier, sans quitter la vue. C'est ce qui permet de comparer deux dossiers voisins sans faire l'aller-retour.
 *
 * ⚠️ UN DOSSIER DÉPLIÉ DONT LE CONTENU N'EST PAS ENCORE ARRIVÉ NE PRODUIT AUCUNE LIGNE : l'écran affiche à sa place
 * une ligne d'attente. Inventer des enfants qu'on n'a pas ferait clignoter la liste à chaque réponse.
 *
 * ⚠️ BORNÉ EN PROFONDEUR. Le Drive du cabinet fait treize niveaux : sans borne, un déplié en cascade produirait une
 * liste que personne ne peut lire et que rien ne sait rendre assez vite.
 */
export const PROFONDEUR_MAX = 6;

export function aplatir(
  racine: readonly EntreeDrive[],
  ouverts: ReadonlySet<string>,
  enfantsDe: (id: string) => readonly EntreeDrive[] | undefined,
  tri: Tri,
  profondeur = 0,
  parent: { id: string; nom: string } | null = null,
): LigneAplatie[] {
  const out: LigneAplatie[] = [];
  for (const e of trier(racine, tri)) {
    out.push({ entree: e, profondeur, parent });
    if (!e.dossier || !ouverts.has(e.id) || profondeur >= PROFONDEUR_MAX) continue;
    const enfants = enfantsDe(e.id);
    if (enfants === undefined) continue;
    // Les enfants d'un dossier déplié ont CE dossier pour parent — et c'est ce qui les rend visables.
    out.push(...aplatir(enfants, ouverts, enfantsDe, tri, profondeur + 1, { id: e.id, nom: e.nom }));
  }
  return out;
}

/**
 * ══ 🔴🔴 LOT RANGER-ARBRE-2 — CE QUE VISE UN LÂCHER SUR UNE LIGNE. PUR. ══════════════════════════════════════════
 *
 * CONSTAT D'ARNO : « si l'on glisse une pièce à ranger sur les LIGNES DE FICHIERS affichées sous un dossier
 * déplié (et non sur la ligne du dossier elle-même), la pièce revient dans “pièces à ranger” ».
 *
 * REPRODUIT AU VRAI GLISSER SOURIS, le 30/09/2026, en instrumentant les événements du navigateur :
 *
 *     dragstart → sfd-piece : DecompteCharges (1).pdf
 *     dragenter → sfd-ligne : 📕 document.pdf   prevented=false   ← personne n'accepte
 *     dragend   → sfd-piece                                       ← et AUCUN drop, jamais
 *
 * La ligne d'un fichier ne posait aucun gestionnaire : le lâcher remontait jusqu'à la fenêtre, dont le `drop`
 * signifie « abandon ». D'où le retour de la pièce, sans un mot.
 *
 * 🔴 LA RÈGLE VOULUE, DANS LES MOTS D'ARNO : « lâcher sur n'importe quelle ligne de fichier = déposer dans le
 * dossier PARENT de ce fichier ». Un fichier n'est JAMAIS une cible — il en DÉSIGNE une, celle qui le contient.
 * C'est le geste du Finder, et c'est aussi ce que l'œil croit faire : on vise un endroit, pas un voisin.
 *
 * ⚠️ MÊME RÈGLE POUR LES TROIS GESTES (glisser d'une pièce, glisser d'un fichier du Drive, ⌘V) : trois chemins
 * qui viseraient trois endroits différents pour un même lâcher seraient un piège.
 *
 * ⚠️ `null` = RIEN À VISER. À la racine du sélecteur, les lignes sont « Mon Drive », « Drives partagés » et
 * « Partagés avec moi » : un fichier n'y existe pas, et ces regroupements ne sont pas des dossiers.
 */
export function cibleDeDepot(
  ligne: { entree: { id: string; nom: string; dossier: boolean }; parent: { id: string; nom: string } | null },
  dossierAffiche: { id: string; nom: string } | null,
): { id: string; nom: string } | null {
  if (ligne.entree.dossier) return { id: ligne.entree.id, nom: ligne.entree.nom };
  return ligne.parent ?? dossierAffiche;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑧ LA VIRTUALISATION — « 1 Propriétaires » compte plus de 300 dossiers
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** La hauteur d'une ligne, en pixels. Nommée ici parce que le calcul et le style doivent dire la même chose. */
export const HAUTEUR_LIGNE = 28;
/**
 * En dessous de ce nombre de lignes, on rend tout : virtualiser une liste de quarante lignes coûte plus cher que
 * de la peindre, et introduit un saut de défilement pour rien.
 */
export const SEUIL_VIRTUALISATION = 120;

/**
 * QUELLES LIGNES PEINDRE. PUR.
 *
 * ⚠️ UNE MARGE AU-DESSUS ET EN DESSOUS (`marge` lignes) : sans elle, un défilement rapide montrerait du blanc le
 * temps d'un rendu. Avec, on peint un écran de plus de chaque côté, ce qui suffit à ne jamais voir le trou.
 */
export function fenetreVisible(
  total: number, scrollTop: number, hauteurVue: number, marge = 8,
): { debut: number; fin: number; avant: number; apres: number } {
  if (total <= SEUIL_VIRTUALISATION) return { debut: 0, fin: total, avant: 0, apres: 0 };
  const premiere = Math.max(0, Math.floor(scrollTop / HAUTEUR_LIGNE) - marge);
  const combien = Math.ceil(hauteurVue / HAUTEUR_LIGNE) + marge * 2;
  const fin = Math.min(total, premiere + combien);
  return { debut: premiere, fin, avant: premiere * HAUTEUR_LIGNE, apres: (total - fin) * HAUTEUR_LIGNE };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑨ LE TITRE DE LA FENÊTRE ET LE FIL D'ARIANE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Le nom du dossier courant, qui sert de titre — comme dans une fenêtre du Finder. PUR. */
export function titreDuChemin(c: Chemin): string {
  return c.at(-1)?.nom ?? 'Google Drive';
}

/**
 * LE FIL D'ARIANE, avec « Mon Drive » en tête. PUR.
 *
 * ⚠️ LE PREMIER MAILLON PORTE L'IDENTIFIANT VIDE : c'est la racine du sélecteur (les trois entrées de Google),
 * pas « Mon Drive » lui-même. Les confondre ferait revenir dans « Mon Drive » quand on voulait revenir au choix.
 */
export function ariane(c: Chemin): { id: string; nom: string; index: number }[] {
  return [
    { id: '', nom: 'Google Drive', index: 0 },
    ...c.map((e, i) => ({ id: e.id, nom: e.nom, index: i + 1 })),
  ];
}
