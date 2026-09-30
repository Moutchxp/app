import { estFichierSystemeMac } from './driveDeplacement';
import { trierPieces } from './lisibilite';
import type { VoisinPossible } from './apercuDrive';

/**
 * LOT PIECES-DE-LA-CONVERSATION — TOUTES LES PIÈCES D'UN ÉCHANGE, EN UN SEUL ENDROIT. Module PUR : aucune base,
 * aucun réseau, aucun DOM, aucun React.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE QUE ÇA RÉPARE. Les pièces d'un échange sont dispersées dans ses messages : pour retrouver « la troisième
 * quittance », il fallait déplier douze messages l'un après l'autre et regarder dans chacun. Sur un échange de
 * syndic qui traîne depuis six mois, personne ne le fait — on redemande le document.
 *
 * Demande d'Arno : « un petit trombone + le nombre total, en haut et en bas ; un clic ouvre un récapitulatif de
 * TOUTES les pièces de la conversation, classées par date, la plus récente d'abord ».
 *
 * ═══ 🔴🔴 CE QUI COMPTE, ET CE QUI NE COMPTE PAS ══════════════════════════════════════════════════════════════════
 *
 * « Les “._” et les images de signature (cid:) ne comptent pas » — et les deux règles existent DÉJÀ ailleurs dans
 * le module, avec leurs épreuves. On les APPELLE, on ne les réécrit pas :
 *
 *   · `trierPieces` (lisibilite.ts) sépare les vraies pièces des images de signature. C'est la MÊME fonction qui
 *     alimente le bloc « N image(s) de signature » replié de chaque message, et le trombone noir des lignes de la
 *     conversation. Une seconde définition ici aurait fait lire « 7 pièces » en haut et compter 9 cartes en bas.
 *   · `estFichierSystemeMac` (driveDeplacement.ts) reconnaît les jumeaux techniques que macOS pose à côté de
 *     chaque fichier (« ._bail.pdf »). Aucun n'existe en base aujourd'hui (27 005 pièces, 0 en « ._ » au
 *     30/09/2026), et c'est précisément pourquoi le filtre est écrit : le jour où l'un arrivera, il n'apparaîtra
 *     pas comme une pièce à retrouver, et personne n'aura à s'en souvenir.
 *
 * 🔴 UNE PIÈCE NON CONSERVÉE COMPTE QUAND MÊME, et ce n'est pas une inattention. Elle a existé dans le courrier ;
 * l'écran doit pouvoir dire « elle a été envoyée, nous ne l'avons pas gardée, voici pourquoi ». La retirer du
 * compte ferait croire que le correspondant ne l'a jamais joint — c'est la règle du module (« une pièce qu'on n'a
 * pas doit se voir »), et c'est aussi ce que comptent déjà les trombones des messages : le total du haut est donc
 * la SOMME de ce qu'on lit sur les lignes, jamais un autre chiffre.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Ce qu'il faut savoir d'une pièce pour la lister. Sous-ensemble de `PieceDeMessage` (carteRepo). */
export interface PiecePortee {
  pieceId: number;
  nomFichier: string;
  typeMime: string | null;
  tailleOctets: number | null;
  disponible: boolean;
  motifNonStocke: string | null;
}

/** Ce qu'il faut savoir d'un message pour dater et attribuer ses pièces. Sous-ensemble de `MessageDeFil`. */
export interface MessagePorteur {
  messageId: number;
  recuLe: string;
  sens: 'recu' | 'envoye';
  de: string;
  deNom: string | null;
  objet: string | null;
  pieces: readonly PiecePortee[];
}

/** Une pièce de la conversation : la pièce, et le message d'où elle vient. */
export interface PieceDeConversation extends PiecePortee {
  messageId: number;
  /** La date du MESSAGE : c'est elle qui classe, et c'est sous elle que les pièces sont regroupées. */
  recuLe: string;
  sens: 'recu' | 'envoye';
  de: string;
  deNom: string | null;
  objet: string | null;
}

/** L'ordre du récapitulatif. Le plus récent d'abord par défaut : c'est le document qu'on vient de recevoir. */
export type OrdrePieces = 'recent' | 'ancien';
export const ORDRE_PIECES_DEFAUT: OrdrePieces = 'recent';

/**
 * ══ 🔴 LES VRAIES PIÈCES D'UN MESSAGE ════════════════════════════════════════════════════════════════════════════
 * Une seule porte d'entrée pour les deux filtres, afin que le compte et la liste ne puissent pas diverger. PUR.
 */
export function vraiesPiecesDuMessage<T extends PiecePortee>(pieces: readonly T[]): T[] {
  return trierPieces(pieces).vraies.filter((p) => !estFichierSystemeMac(p.nomFichier));
}

/**
 * ══ 🔴🔴 TOUTES LES PIÈCES DE LA CONVERSATION, CLASSÉES. PUR. ════════════════════════════════════════════════════
 *
 * Arno : « Classement par DATE, plus récente d'abord, avec un bouton pour inverser l'ordre. Les pièces d'un même
 * message sont regroupées sous la date du message. »
 *
 * 🔴 ON CLASSE LES MESSAGES, PAS LES PIÈCES, et c'est ce qui fait tenir le regroupement : deux pièces d'un même
 * mail portent la même date à la seconde, et un tri pièce par pièce pourrait les séparer si un troisième message
 * partageait cette date. En classant les messages puis en gardant l'ordre du mail à l'intérieur, les pièces d'un
 * message restent ensemble, dans l'ordre où le correspondant les a jointes.
 *
 * ⚠️ L'ÉGALITÉ DE DATE EST TRANCHÉE PAR L'IDENTIFIANT, jamais laissée au hasard du tri : deux mails horodatés à la
 * même seconde (un envoi automatique en rafale) donneraient sinon un ordre qui change d'un affichage à l'autre.
 */
export function piecesDeLaConversation(
  messages: readonly MessagePorteur[], ordre: OrdrePieces = ORDRE_PIECES_DEFAUT,
): PieceDeConversation[] {
  const sens = ordre === 'recent' ? -1 : 1;
  const classes = [...messages]
    .map((m) => ({ m, t: Date.parse(m.recuLe) }))
    .sort((a, b) => {
      // Une date illisible ne doit pas emporter le tri : elle se comporte comme la plus ancienne.
      const ta = Number.isNaN(a.t) ? -Infinity : a.t;
      const tb = Number.isNaN(b.t) ? -Infinity : b.t;
      if (ta !== tb) return (ta - tb) * sens;
      return (a.m.messageId - b.m.messageId) * sens;
    });

  const out: PieceDeConversation[] = [];
  for (const { m } of classes) {
    for (const p of vraiesPiecesDuMessage(m.pieces)) {
      out.push({
        ...p,
        messageId: m.messageId, recuLe: m.recuLe, sens: m.sens, de: m.de, deNom: m.deNom, objet: m.objet,
      });
    }
  }
  return out;
}

/** Le TOTAL affiché par le trombone. PUR. */
export function compterPiecesConversation(messages: readonly MessagePorteur[]): number {
  let n = 0;
  for (const m of messages) n += vraiesPiecesDuMessage(m.pieces).length;
  return n;
}

/** « 7 pièces », « 1 pièce ». Écrit ici pour que le haut, le bas et le titre de la fenêtre disent le même mot. PUR. */
export function motPieces(n: number): string {
  return `${n} pièce${n > 1 ? 's' : ''}`;
}

/** L'infobulle du trombone, dans les mots d'Arno. PUR. */
export const INFOBULLE_PIECES_CONVERSATION = 'Toutes les pièces jointes de la conversation';
/** Le titre de la fenêtre, dans les mots d'Arno. PUR. */
export const TITRE_PIECES_CONVERSATION = 'Pièces jointes de la conversation';

/**
 * D'OÙ VIENT CETTE PIÈCE. PUR.
 *
 * ⚠️ POURQUOI PAS `libelleSens` (ecran.ts), QUI DIT DÉJÀ « reçu de » / « nous avons écrit ». Parce qu'ici le sujet
 * est un FICHIER, pas un message : « nous avons écrit bail.pdf » ne se lit pas. Arno a donné les deux formules —
 * « reçu de X » et « nous avons envoyé » — et c'est un vocabulaire de pièce, non de courrier. Les deux fonctions
 * disent donc deux choses différentes ; aucune ne recopie l'autre.
 */
export function mentionExpediteurPiece(p: { sens: 'recu' | 'envoye'; de: string; deNom: string | null }): string {
  if (p.sens === 'envoye') return 'nous avons envoyé';
  const qui = (p.deNom ?? '').trim() !== '' ? (p.deNom as string).trim() : p.de.trim();
  return qui === '' ? 'reçu' : `reçu de ${qui}`;
}

/**
 * LE BOUTON D'INVERSION DIT L'ORDRE EN COURS, pas celui qu'il donnerait. PUR.
 *
 * ⚠️ C'est la convention déjà retenue pour l'ordre de lecture des messages (`libelleOrdre`, conversation.ts) : un
 * bouton qui annonce ce qu'il va faire oblige à réfléchir à chaque lecture. Deux conventions opposées dans la même
 * fenêtre seraient pires que l'une ou l'autre.
 */
export function libelleOrdrePieces(o: OrdrePieces): string {
  return o === 'recent' ? 'Plus récente d’abord' : 'Plus ancienne d’abord';
}

export function ordrePiecesSuivant(o: OrdrePieces): OrdrePieces {
  return o === 'recent' ? 'ancien' : 'recent';
}

/** Les pièces d'un même message, sous sa date. PUR. */
export interface GroupeDePieces {
  messageId: number;
  recuLe: string;
  sens: 'recu' | 'envoye';
  de: string;
  deNom: string | null;
  objet: string | null;
  pieces: PieceDeConversation[];
}

/**
 * REGROUPE LA LISTE CLASSÉE PAR MESSAGE, SANS LA RECLASSER. PUR.
 *
 * ⚠️ ELLE NE TRIE RIEN : elle suit l'ordre reçu. Trier ici aurait donné un second endroit où l'ordre se décide, et
 * le bouton d'inversion aurait pu cesser d'agir sans que rien ne le dise.
 */
export function grouperParMessage(pieces: readonly PieceDeConversation[]): GroupeDePieces[] {
  const out: GroupeDePieces[] = [];
  for (const p of pieces) {
    const dernier = out[out.length - 1];
    if (dernier !== undefined && dernier.messageId === p.messageId) { dernier.pieces.push(p); continue; }
    out.push({
      messageId: p.messageId, recuLe: p.recuLe, sens: p.sens, de: p.de, deNom: p.deNom, objet: p.objet,
      pieces: [p],
    });
  }
  return out;
}

/**
 * ══ 🔴🔴 LE PÉRIMÈTRE DE « PRÉCÉDENT / SUIVANT » CÔTÉ COURRIER ═══════════════════════════════════════════════════
 *
 * Arno : « côté MAIL, les boutons ◀ Précédent / Suivant ▶ et les flèches ← → parcourent TOUTES les pièces de la
 * conversation, dans l'ordre de la modale. Côté DRIVE : inchangé (borné au dossier ouvert). »
 *
 * 🔴 UN PARENT INVENTÉ, ET C'EST LUI QUI SÉPARE LES DEUX MONDES. `voisinsVisualisables` ne retient que ce qui
 * partage le MÊME dossier parent que le document ouvert : en donnant aux pièces du courrier un parent qui
 * n'existe dans aucun Drive, aucun fichier du Drive ne peut entrer dans ce tour, et aucune pièce ne peut sortir
 * vers le Drive. La règle de sécurité du tour (« on ne quitte jamais l'endroit où l'on avait le droit de
 * regarder ») est donc tenue par le MÊME code que côté Drive, sans exception à écrire.
 *
 * ⚠️ DISTINCT DU PARENT DES « PIÈCES À RANGER » (`svv:pieces-du-mail`, SelecteurFichierDrive), et exprès : la
 * fenêtre « Ranger » parcourt les pièces QU'ON EST EN TRAIN DE RANGER, ce qu'Arno demande de laisser inchangé.
 * Deux tours distincts, donc deux parents distincts — un seul les aurait mélangés.
 */
export const PARENT_PIECES_CONVERSATION = 'svv:pieces-de-la-conversation';

/**
 * Le voisinage à donner à la visionneuse. PUR.
 *
 * ⚠️ LES PIÈCES NON CONSERVÉES EN SONT ÉCARTÉES : il n'y a pas d'octets à montrer, et « Suivant » tomberait sur un
 * cadre vide. Elles restent listées dans la fenêtre, avec leur motif — c'est là qu'on apprend qu'elles ont existé.
 */
export function voisinagePiecesConversation(pieces: readonly PieceDeConversation[]): VoisinPossible[] {
  return pieces.filter((p) => p.disponible).map((p) => ({
    id: String(p.pieceId), nom: p.nomFichier, typeMime: p.typeMime ?? '',
    dossier: false, parentId: PARENT_PIECES_CONVERSATION,
  }));
}
