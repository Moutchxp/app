import { estFichierSystemeMac } from './driveDeplacement';
import { dateJourEtHeure } from './ecran';
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
  /** 🔴 LOT NOM-UNIQUE-DES-PIECES — le nom d'USAGE : c'est lui qu'on affiche, qu'on envoie et qu'on cherche. */
  nomFichier: string;
  /**
   * 🔴 LE NOM D'ORIGINE, sous lequel le correspondant l'a envoyée. Jamais modifié : c'est lui qu'on retrouvera
   * dans Gmail, qui ne permet pas de renommer une pièce jointe. La mention « reçue sous : … » en vit.
   *
   * ⚠️ FACULTATIF : les appelants d'avant ce lot ne le donnent pas, et la mention ne s'affiche alors jamais —
   * ce qui est exactement le comportement d'avant.
   */
  nomOrigine?: string;
  typeMime: string | null;
  tailleOctets: number | null;
  disponible: boolean;
  motifNonStocke: string | null;
  /**
   * 🔴 LOT RECAP-SANS-DOUBLON — L'EMPREINTE DU CONTENU (`gestion_piece.empreinte_sha256`). C'est ELLE qui dit si
   * deux pièces sont le même fichier. `null` = pièce sans octets chez nous : on retombe alors sur le nom et la
   * taille, et l'écran le SIGNALE (voir `dedoublonnerPieces`).
   */
  empreinte: string | null;
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

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT RECAP-SANS-DOUBLON — UNE MÊME PIÈCE N'APPARAÎT QU'UNE FOIS DANS LE RÉCAPITULATIF
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   CONSTAT D'ARNO, fil 3494 : le récapitulatif annonçait « 30 pièces ». Mesuré en base le 30/09/2026 : le fil porte
   36 pièces brutes pour 8 fichiers DIFFÉRENTS. Les mêmes avis d'imposition y figurent jusqu'à cinq fois, parce
   qu'ils ont été reçus, puis transférés, puis re-transférés — chaque transfert rejoignant les MÊMES octets.

   🔴 CE QUE ÇA COÛTAIT : le récapitulatif existe pour retrouver « la troisième quittance » sans déplier douze
   messages. Une liste où le même document revient cinq fois oblige à faire exactement ce qu'elle devait éviter :
   comparer les vignettes une par une pour savoir si l'on a affaire à cinq documents ou à un seul.

   ═══ CE QUI FAIT QUE DEUX PIÈCES SONT « LA MÊME » ═══════════════════════════════════════════════════════════════

   🔴 LE CONTENU, JAMAIS LE NOM. Règle d'Arno, et elle tient dans les deux sens :
     · une pièce RENOMMÉE avant d'être renvoyée reste la même pièce — le nom est ce qui change le plus facilement ;
     · deux fichiers DIFFÉRENTS peuvent parfaitement porter le même nom (« facture.pdf » de deux fournisseurs),
       et les fondre ferait disparaître un document de la liste. C'est la faute la plus grave des deux : un doublon
       se voit, une pièce manquante ne se voit pas.

   ⚠️ L'EMPREINTE EXISTE DÉJÀ, ET ELLE EST COMPLÈTE. `gestion_piece.empreinte_sha256` est renseignée pour 26 604
   pièces sur 26 604 qui ont des octets (mesuré le 30/09/2026) ; les 430 sans empreinte sont exactement les 430
   sans `cle_stockage` — des pièces qu'on n'a jamais conservées, dont il n'y a donc rien à lire. AUCUNE MIGRATION
   N'EST NÉCESSAIRE, et il n'y a aucune empreinte à calculer : la question était déjà résolue ailleurs.

   ⚠️ SHA-256 PLUTÔT QUE MD5 (Arno a écrit « md5 ») : c'est l'empreinte que le module calcule déjà à la capture.
   En ajouter une seconde ferait deux vérités à tenir, et md5 est la plus faible des deux. La TAILLE entre quand
   même dans la clé, comme demandé — elle ne coûte rien et ferme le cas d'école.
*/

/** Une apparition d'une pièce dans la conversation : de quel message, et quand. */
export interface ApparitionPiece {
  pieceId: number;
  messageId: number;
  recuLe: string;
  sens: 'recu' | 'envoye';
  de: string;
  deNom: string | null;
}

/** Une pièce du récapitulatif : la PREMIÈRE apparition, et la liste des autres. */
export interface PieceDedoublonnee extends PieceDeConversation {
  /**
   * Les AUTRES apparitions du même fichier, de la plus ancienne à la plus récente. Vide dans le cas ordinaire.
   * L'écran en fait une ligne discrète et cliquable par apparition (« aussi envoyée le 30/09 à 17:49 »).
   */
  autresApparitions: ApparitionPiece[];
  /**
   * ⚠️ VRAI QUAND LE RAPPROCHEMENT S'EST FAIT SUR LE NOM ET LA TAILLE, faute d'empreinte. L'écran le SIGNALE :
   * c'est une présomption, pas une preuve, et qui la lit doit savoir laquelle des deux il regarde.
   */
  parNomEtTaille: boolean;
}

/**
 * LA CLÉ D'IDENTITÉ D'UNE PIÈCE. PUR.
 *
 * 🔴 DEUX ESPACES DE NOMS SÉPARÉS (`e:` et `n:`), ET C'EST VOLONTAIRE. Une pièce identifiée par son empreinte ne
 * doit JAMAIS être confondue avec une pièce identifiée par son nom : la première est une preuve, la seconde une
 * présomption, et les mélanger ferait passer la présomption pour la preuve.
 */
/**
 * ⚠️ LE PARAMÈTRE EST RÉDUIT À CE QU'ELLE LIT (lot FENETRES-INDEPENDANTES) : nom, taille, empreinte. Elle n'a
 * jamais eu besoin du reste d'une `PiecePortee`, et l'exiger empêchait de l'appeler depuis la liste — qui ne
 * lit pas les mêmes colonnes. Tout appelant existant continue de passer, une `PiecePortee` ayant ces trois-là.
 */
export function cleIdentitePiece(
  p: Pick<PiecePortee, 'nomFichier' | 'tailleOctets' | 'empreinte'>,
): { cle: string; parNomEtTaille: boolean } {
  const taille = p.tailleOctets === null ? '?' : String(p.tailleOctets);
  const e = (p.empreinte ?? '').trim().toLowerCase();
  if (e !== '') return { cle: `e:${e}|${taille}`, parNomEtTaille: false };
  /* Le nom est normalisé (espaces, casse) : « Bail.PDF » et « bail.pdf » sont le même nom pour un humain.
     ⚠️ `?? ''` : un nom absent ne doit pas faire tomber un COMPTEUR de liste. Deux pièces sans nom ni empreinte
     se confondraient alors sur la même clé — c'est le bon comportement : on ne sait rien qui les distingue. */
  return { cle: `n:${(p.nomFichier ?? '').trim().toLowerCase()}|${taille}`, parNomEtTaille: true };
}

/**
 * ══ 🔴🔴 LOT FENETRES-INDEPENDANTES-ET-DEFILEMENT-DRIVE — LA MÊME CLÉ, RENDUE EN SQL ════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DÉCISION D'ARNO (03/10/2026) : « dédoublonne le compteur de pièces de la ligne de liste par empreinte, comme la
 * conversation le fait déjà, dans les cinq compteurs. »
 *
 * LE DÉFAUT QUE ÇA FERME, mesuré la veille sur l'échange 36694 : la ligne annonçait 4 pièces, la conversation 3.
 * La quatrième était `test renomage.pdf` (pièce 27121), qui porte EXACTEMENT la même empreinte sha256 que
 * `0851_001.pdf` (pièce 27087) — le même document, réattaché par notre propre transfert.
 *
 * 🔴 CE N'EST PAS UNE SECONDE ÉCRITURE DE LA RÈGLE, C'EST LA MÊME, RENDUE DANS L'AUTRE LANGUE — exactement le
 * patron de `sqlEstVraiePiece` dans `lisibilite.ts`. Les deux espaces de noms (`e:` et `n:`), la normalisation du
 * nom et le repli `'?'` sur une taille inconnue sont reproduits au caractère près, et une épreuve les tient
 * ensemble sur une table de cas. Une « équivalence » approximative aurait fini par compter autrement, et l'on
 * aurait repayé le défaut qu'on répare.
 *
 * ⚠️ POURQUOI UNE CHAÎNE ET NON UN `DISTINCT (empreinte, taille)` : une pièce SANS empreinte doit compter pour
 * elle-même, par son nom. Un `DISTINCT` sur deux colonnes dont l'une est `NULL` les ferait toutes se confondre —
 * ou toutes se séparer, selon le dialecte. Une clé unique, construite explicitement, ne laisse pas ce choix.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function sqlCleIdentitePiece(alias: string, sqlNomAffiche: string): string {
  const taille = `coalesce(${alias}.taille_octets::text, '?')`;
  const empreinte = `lower(btrim(coalesce(${alias}.empreinte_sha256, '')))`;
  /**
   * 🔴🔴 LE NOM EST CELUI D'USAGE, ET IL ARRIVE DÉJÀ RENDU. C'est la raison pour laquelle cette fonction prend un
   * second argument au lieu de nommer la colonne : en TypeScript, `cleIdentitePiece` reçoit `nomFichier`, qui EST
   * le nom d'usage (lot NOM-UNIQUE-DES-PIECES). Lire `nom_fichier` en SQL donnerait le nom d'ARRIVÉE — donc une
   * clé différente des deux côtés dès qu'une pièce a été renommée, et un dédoublonnage qui ne dédoublonne plus.
   *
   * ⚠️ `sqlNomAffiche` EST ASYNCHRONE CHEZ L'APPELANT (il sonde la migration 286) : ce module est PUR et ne peut
   * pas l'appeler lui-même. On le reçoit tout prêt, et le garde du module l'exige à l'appel.
   */
  const nom = `lower(btrim(coalesce(${sqlNomAffiche}, '')))`;
  return `CASE WHEN ${empreinte} <> '' THEN 'e:' || ${empreinte} || '|' || ${taille}`
    + ` ELSE 'n:' || ${nom} || '|' || ${taille} END`;
}

/**
 * ══ 🔴🔴 LE RÉCAPITULATIF, SANS DOUBLON. PUR. ═══════════════════════════════════════════════════════════════════
 *
 * Arno : « On garde la PREMIÈRE apparition (la plus ancienne), avec son message et sa date. »
 *
 * 🔴 « LA PLUS ANCIENNE » SE DÉCIDE SUR LA CHRONOLOGIE, PAS SUR L'ORDRE D'AFFICHAGE. Le bouton « Plus récente
 * d'abord » inverse ce qu'on voit ; s'il décidait aussi QUI SURVIT, la même pièce changerait de date et de message
 * selon le sens de lecture — et la mention « aussi envoyée le… » désignerait tantôt l'un, tantôt l'autre. On
 * dédoublonne donc toujours dans l'ordre du temps, puis on affiche dans l'ordre demandé.
 *
 * ⚠️ ELLE NE RETRIE RIEN : elle reçoit une liste déjà classée par `piecesDeLaConversation` et se contente d'en
 * retirer les répétitions. L'ordre d'affichage, et lui seul, reste décidé à un endroit.
 */
export function dedoublonnerPieces(
  piecesAffichees: readonly PieceDeConversation[],
): { pieces: PieceDedoublonnee[]; sansEmpreinte: number } {
  // ① L'ORDRE DU TEMPS, quel que soit l'ordre d'affichage reçu. L'identifiant tranche les ex æquo, comme partout.
  const chronologie = [...piecesAffichees].sort((a, b) => {
    const ta = Date.parse(a.recuLe);
    const tb = Date.parse(b.recuLe);
    const va = Number.isNaN(ta) ? -Infinity : ta;
    const vb = Number.isNaN(tb) ? -Infinity : tb;
    if (va !== vb) return va - vb;
    if (a.messageId !== b.messageId) return a.messageId - b.messageId;
    return a.pieceId - b.pieceId;
  });

  const gardee = new Map<string, { piece: PieceDeConversation; autres: ApparitionPiece[]; parNom: boolean }>();
  const cleDeLaPiece = new Map<number, string>();
  for (const p of chronologie) {
    const { cle, parNomEtTaille } = cleIdentitePiece(p);
    cleDeLaPiece.set(p.pieceId, cle);
    const deja = gardee.get(cle);
    if (deja === undefined) {
      gardee.set(cle, { piece: p, autres: [], parNom: parNomEtTaille });
      continue;
    }
    deja.autres.push({
      pieceId: p.pieceId, messageId: p.messageId, recuLe: p.recuLe, sens: p.sens, de: p.de, deNom: p.deNom,
    });
  }

  // ② L'ORDRE D'AFFICHAGE REÇU, en ne gardant que les survivantes. On ne réordonne pas : on filtre.
  const pieces: PieceDedoublonnee[] = [];
  for (const p of piecesAffichees) {
    const cle = cleDeLaPiece.get(p.pieceId);
    const g = cle === undefined ? undefined : gardee.get(cle);
    if (g === undefined || g.piece.pieceId !== p.pieceId) continue;
    pieces.push({ ...p, autresApparitions: g.autres, parNomEtTaille: g.parNom });
  }

  // ⚠️ ON NE COMPTE QUE LES RAPPROCHEMENTS RÉELLEMENT FAITS SANS EMPREINTE : une pièce sans empreinte qui
  //    n'apparaît qu'une fois n'a rapproché personne, et l'annoncer inquiéterait pour rien.
  const sansEmpreinte = pieces.filter((p) => p.parNomEtTaille && p.autresApparitions.length > 0).length;
  return { pieces, sansEmpreinte };
}

/**
 * ══ 🔴🔴 LES IDENTIFIANTS DONT LE RÉSUMÉ A BESOIN POUR INTERROGER LE DRIVE. PUR. ═════════════════════════════════
 *
 * 🔴 LES **AUTRES APPARITIONS** EN FONT PARTIE, ET C'EST TOUT L'INTÉRÊT DE CETTE FONCTION. Le dépôt dans le Drive
 * est enregistré contre LA pièce rangée : si l'on a rangé la copie du 30/09 et que le résumé montre celle du
 * 23/09, l'identifiant affiché n'a aucun dépôt — c'est sur l'autre apparition qu'il se trouve. L'écran le sait
 * déjà quand il AFFICHE (le repli de `ResumePieces`) ; il faut qu'il le sache aussi quand il DEMANDE, sinon le
 * picto « déjà dans le Drive » disparaît précisément dans le cas qui a fondé le lot EMPREINTE-PIECES.
 *
 * ⚠️ TRIÉS, ET SANS RÉPÉTITION : l'adresse demandée ne doit dépendre que de l'ENSEMBLE des pièces, jamais de
 * leur ordre d'affichage — sinon inverser le fil relancerait une requête pour obtenir la même réponse.
 */
export function idsDesPiecesEtDeLeursJumelles(pieces: readonly PieceDedoublonnee[]): number[] {
  const ids = new Set<number>();
  for (const p of pieces) {
    ids.add(p.pieceId);
    for (const a of p.autresApparitions) ids.add(a.pieceId);
  }
  return [...ids].sort((a, b) => a - b);
}

/**
 * LA MENTION D'UNE AUTRE APPARITION, dans les mots d'Arno : « aussi envoyée le 30/09 à 17:49 ». PUR.
 *
 * ⚠️ LE PARTICIPE S'ACCORDE AVEC « LA PIÈCE », pas avec le message : « aussi envoyée », « aussi reçue ». C'est un
 * vocabulaire de fichier, comme `mentionExpediteurPiece` juste au-dessus — et pour la même raison.
 *
 * ══ 🔴 LE CAS DU MÊME MESSAGE, VU À L'ÉCRAN LE 30/09/2026 ═══════════════════════════════════════════════════════
 *
 * Le mail du 23/09 portait DEUX FOIS « RD TF Pergolèse 2026.pdf » (pièces 2470 et 2473, mêmes octets). Le renvoi
 * se lisait alors « aussi reçue le 23/09 à 15:57 » sous une carte datée du 23/09 à 15:57 — une phrase qui a l'air
 * fausse, et qui fait chercher un second mail qui n'existe pas.
 *
 * 🔴 ON NE LA SUPPRIME PAS : la pièce est bien là deux fois, et l'effacer ferait mentir le compte du message, qui
 * en annonce deux. On la NOMME pour ce qu'elle est.
 */
export function mentionAutreApparition(
  a: { sens: 'recu' | 'envoye'; recuLe: string; messageId: number }, messageDeLaPiece?: number,
): string {
  const participe = a.sens === 'envoye' ? 'envoyée' : 'reçue';
  if (messageDeLaPiece !== undefined && a.messageId === messageDeLaPiece) {
    return 'jointe une seconde fois au même message';
  }
  return `aussi ${participe} le ${dateJourEtHeure(a.recuLe)}`;
}

/**
 * ══ 🔴 LE TOTAL DU TROMBONE : LE NOMBRE DE PIÈCES **DIFFÉRENTES**. PUR. ═════════════════════════════════════════
 *
 * 🔴 IL SORT DU MÊME CALCUL QUE LA LISTE, et c'est non négociable : c'est la règle qui empêchait déjà de lire
 * « 7 pièces » en haut et d'en compter neuf en bas. Recompter autrement ici — même « juste » aujourd'hui — ferait
 * revenir le défaut au premier changement de définition du doublon.
 *
 * ⚠️ CECI NE CHANGE PAS LE TROMBONE D'UN MESSAGE NI CELUI D'UNE LIGNE DE LISTE (demande d'Arno) : ceux-là comptent
 * les pièces DE LEUR message, doublons compris — un mail qui re-transmet cinq pièces déjà reçues en porte bien
 * cinq, et prétendre le contraire mentirait sur ce qui est parti.
 */
export function compterPiecesConversation(messages: readonly MessagePorteur[]): number {
  return dedoublonnerPieces(piecesDeLaConversation(messages)).pieces.length;
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
export interface GroupeDePieces<T extends PieceDeConversation = PieceDeConversation> {
  messageId: number;
  recuLe: string;
  sens: 'recu' | 'envoye';
  de: string;
  deNom: string | null;
  objet: string | null;
  pieces: T[];
}

/**
 * REGROUPE LA LISTE CLASSÉE PAR MESSAGE, SANS LA RECLASSER. PUR.
 *
 * ⚠️ ELLE NE TRIE RIEN : elle suit l'ordre reçu. Trier ici aurait donné un second endroit où l'ordre se décide, et
 * le bouton d'inversion aurait pu cesser d'agir sans que rien ne le dise.
 */
export function grouperParMessage<T extends PieceDeConversation>(pieces: readonly T[]): GroupeDePieces<T>[] {
  const out: GroupeDePieces<T>[] = [];
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
