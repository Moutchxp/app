/**
 * MODULE « GESTION » — LOT 5a : LA BOÎTE MAIL. Lecture SEULE (aucun INSERT/UPDATE/DELETE dans ce fichier).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER EXISTE. La file du poste de tri ne montre que les échanges des 30 derniers jours encore à
 * classer : 442 sur 17 231, soit 2,6 %. Le reste est compté, annoncé — et inatteignable. Or la boîte est faite pour
 * être LUE en entier, comme on lit sa messagerie : tout le courrier, du plus récent au plus ancien, sans condition.
 *
 * 🔴 CE FICHIER NE REMPLACE RIEN. `fileRepo.ts` (le poste de tri) n'est pas touché : sa fenêtre de 30 jours, son
 * compteur d'échanges plus anciens et ses gestes restent exactement ce qu'ils étaient. Les deux lectures cohabitent
 * parce qu'elles répondent à deux questions différentes : « qu'ai-je à traiter ? » et « qu'est-ce qui existe ? ».
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * 🔴 PAGINATION PAR CURSEUR, ET PAS PAR `OFFSET`. Sur 17 231 échanges, `OFFSET 10000` oblige PostgreSQL à produire et
 * jeter dix mille lignes avant de rendre la page — le coût grandit avec la profondeur, et deux pages consécutives
 * peuvent se chevaucher ou sauter une ligne si un message arrive entre les deux. Le curseur `(date, identifiant)` n'a
 * aucun de ces deux défauts : il désigne un POINT dans l'ordre, pas un rang.
 *
 * 🔴 COMMENT LA REQUÊTE RESTE RAPIDE — et pourquoi elle n'est pas écrite comme on l'écrirait spontanément. Trier des
 * échanges par « date du dernier message » demande un `max()` par échange. La forme évidente (`DISTINCT ON (fil_id) …
 * ORDER BY fil_id, recu_le DESC`) calcule ce maximum pour LES 17 231 ÉCHANGES, puis en jette 17 201 : mesuré à 42 ms
 * par page, avec un balayage complet de `gestion_message`. On prend donc le problème à l'envers : on parcourt les
 * MESSAGES du plus récent au plus ancien (index `gestion_message_recu_idx`) et on ne garde que ceux qui sont le
 * DERNIER de leur échange (`NOT EXISTS`, servi par `gestion_message_attente_idx`). L'ordre des messages EST alors
 * l'ordre des échanges, le `LIMIT` arrête le parcours, et rien n'est calculé pour les pages qu'on ne demande pas.
 * MESURÉ sur cluster jetable au volume d'arrivée (56 000 messages, 17 231 échanges, 2 400 affectations) :
 * **0,67 ms par page**, y compris à 300 jours de profondeur, sans un seul balayage séquentiel. Aucun index à créer :
 * les deux qui servent existent depuis la migration 228.
 */
import { query } from '../db/client';
import { autoImposeParEtiquette, type Etiquette } from './ecranUrl';
import { libelleExpediteur, type PartenaireInterne } from './partenaires';
import { nonRemisesDesFils, type MentionNonRemise } from './nonRemiseRepo';
// LOT LIGNE-NON-ENVOYE — les mails qui ne sont pas partis, à montrer dans « Envoyés » et dans le fil.
import { nonEnvoyesAMontrer, nonEnvoyesDesFils } from './fileEnvoiRepo';
// 🔴 LOT NOM-UNIQUE-DES-PIECES — le repli « nom d'usage, sinon nom d'origine », écrit UNE fois.
import { sqlNomAffiche } from './nomUsageSql';
import { fusionnerNonEnvoyes, type MentionNonEnvoye } from './fileEnvoi';
import {
  corbeilleGmailDisponible, spamDisponible, rattachementsDisponibles, horsGestionDisponible, etoileGmailDisponible,
  interneDisponible,
} from './schema';
import { etoilesDesFils } from './etoileRepo';
/**
 * 🔴 LOT ETOILE-ET-SIGNATURE — L'ÉTOILE DE GMAIL, DEVENUE LA SEULE. `etoilesDesFils` (celle de l'équipe) reste
 * importée juste au-dessus : sans la migration 277, c'est encore elle qui répond, et la liste se comporte
 * exactement comme avant ce lot. Les deux ne sont JAMAIS lues ensemble — une ligne ne porte qu'une étoile.
 */
import { filsEtoiles } from './etoileGmailRepo';
// 🔴 LOT RATTACHER-EN-ECRIVANT — la marque « Interne » de l'échange : jointure et colonne, écrites UNE fois.
import { sqlColonneInterne, sqlJointureInterne } from './interneRepo';
// LOT LECTURE-HTML-FIL-TROMBONE — la MÊME règle que la conversation pour distinguer une pièce d'un logo de signature.
import { trierPieces, type PieceATrier } from './lisibilite';
// LOT BOITE-INTERNE-CORBEILLE — « nous », c'est `gestion_config.adresse_gestion`, lue à la MÊME source que la capture.
import { chargerConfigGestion } from './config';

/**
 * Combien d'échanges par page. Assez pour remplir un écran de téléphone sans faire attendre.
 *
 * 🔴 LOT LISTE-PAGINATION — 25 ET NON PLUS 30, valeur demandée par Arno (« 25 échanges par page par défaut »).
 * Les trente d'avant venaient d'un défilement sans fin, où le nombre exact ne se voyait pas ; il se lit maintenant
 * dans « 1–25 sur N », en haut et en bas de chaque page.
 */
export const PAGE_BOITE = 25;

/** Extrait BRUT rapporté du dernier message. Généreux à dessein : l'écran y retire l'historique cité avant d'afficher. */
const LONGUEUR_EXTRAIT = 600;

/**
 * Le curseur : le dernier échange rendu. `null` = première page. Les DEUX champs comptent — la date seule ne suffit
 * pas : deux échanges peuvent porter exactement le même instant, et la pagination en sauterait un ou le rendrait deux
 * fois. L'identifiant tranche, et il est unique.
 */
export interface CurseurBoite {
  /** Date du dernier message de l'échange précédent, en ISO. */
  dernierLe: string;
  /** Identifiant de cet échange. Rendu en CHAÎNE : `pg` rend les `bigint` ainsi, et un identifiant n'est pas un nombre. */
  filId: string;
}

/** Une ligne de la boîte, telle que l'écran l'affiche. */
export interface LigneBoite {
  filId: number;
  /** Objet de l'échange, NON nettoyé ici (l'écran applique `nettoyerObjet`, comme partout ailleurs). */
  objet: string | null;
  /** Le correspondant : jamais nous. Voir `SQL_INTERLOCUTEUR`. */
  interlocuteur: string | null;
  /**
   * ══ 🔴 LOT MESSAGE-CLIQUÉ — LE MESSAGE QUE CETTE LIGNE REPRÉSENTE ═══════════════════════════════════════════
   * Celui dont la ligne montre la date, l'expéditeur et l'extrait : sous « Réception » le dernier message REÇU,
   * sous « Envoyés » le dernier ENVOYÉ, ailleurs le dernier de l'échange (voir `sensDeLEtiquette`). C'est LUI que
   * le clic doit ouvrir déplié — jusqu'ici la conversation ouvrait toujours son dernier message, si bien qu'en
   * Réception on cliquait sur une question reçue à 12 h 37 et on tombait sur notre propre réponse de 15 h 58.
   *
   * ⚠️ IL SORT DÉJÀ DU CTE `page` (`m.id AS message_id`) : le prédicat « dernier de son échange, dans ce sens »
   * l'a désigné pour construire toute la ligne. On ne le CHERCHE donc pas, on cesse simplement de le jeter — une
   * seconde requête pour le retrouver donnerait deux vérités qui finiraient par diverger.
   */
  messageAffiche: number;
  /** Sens du DERNIER message — l'écran dit « Vous : … » quand c'est nous qui avons écrit en dernier. */
  dernierSens: 'recu' | 'envoye';
  dernierLe: string;
  extrait: string | null;
  nbMessages: number;
  /** Messages LISIBLES aujourd'hui (non écartés par une règle). `0` = tout l'échange est du courrier automatique. */
  nbLisibles: number;
  aPiece: boolean;
  /**
   * LOT LISTE-GMAIL — COMBIEN de pièces jointes porte l'échange. La ligne affiche « 📎 2 » : un trombone sans
   * nombre ne disait pas s'il y avait une pièce ou douze. `aPiece` reste — c'est lui qui décide d'AFFICHER le
   * trombone, et il est vrai dès la première pièce.
   */
  nbPieces: number;
  /**
   * ══ 🔴🔴 LOT LECTURE-HTML-FIL-TROMBONE — LE TROMBONE DIT OÙ EST LA PIÈCE ═══════════════════════════════════
   *
   * DEMANDE D'ARNO : un trombone NOIR quand c'est le message AFFICHÉ SUR LA LIGNE qui porte une pièce, GRIS quand
   * la pièce est ailleurs dans la conversation, ABSENT quand il n'y en a nulle part.
   *
   * 🔴 CE QUE ÇA RÉPARE. Le trombone comptait les pièces de tout l'ÉCHANGE : une conversation de douze messages
   * dont un seul portait un bail affichait « 📎 1 » sur la ligne du dernier message, qui n'a rien. On ouvrait
   * pour ne rien trouver — et, à l'inverse, on n'ouvrait pas une ligne dont le mail portait justement la pièce
   * qu'on cherchait.
   *
   * ⚠️ LES DEUX NOMBRES EXCLUENT LES IMAGES DE SIGNATURE ET LES FICHIERS « ._ ». Un logo de signature n'est pas
   * une pièce jointe : le compter ferait porter un trombone à la moitié du courrier. La règle n'est PAS réécrite
   * ici — c'est `trierPieces` (module `lisibilite`), la MÊME fonction que l'écran d'un message, appliquée aux
   * mêmes données. Une seconde règle écrite en SQL aurait fini par compter autrement que la conversation.
   */
  piecesDuMessage: number;
  /** Les pièces de la conversation qui ne sont PAS sur le message affiché. Mêmes exclusions. */
  piecesAilleurs: number;
  /**
   * LOT LISTE-GMAIL — l'échange porte-t-il l'étoile de l'ÉQUIPE ? (Pas celle de Gmail : voir `etoileRepo`.)
   * Toujours `false` sans la migration 264 — on ne prétend pas savoir ce qu'on n'a pas lu.
   */
  etoilee: boolean;
  /**
   * LOT CAPSULE-STATUT — où en est le RATTACHEMENT de cet échange. `null` = migration 257 absente : aucune capsule
   * n'est rendue, plutôt qu'une capsule rouge qui accuserait à tort.
   */
  classement: { nbActifs: number; parUnHumain: boolean; detail: string | null } | null;
  /**
   * 🔴 LOT STATUT-HORS-GESTION — ce MAIL (celui que la ligne représente) a-t-il été marqué « hors gestion » à la
   * main ? Jamais posé automatiquement, et jamais prioritaire sur un rattachement réel : c'est `capsuleStatut` qui
   * tranche. `false` quand la migration 266 manque — on n'invente pas un état qu'on n'a pas lu.
   */
  horsGestion?: boolean;
  /** `prospection` | `interne` | `autre`, ou `null` : le motif est facultatif. */
  motifHorsGestion?: string | null;
  /**
   * 🔴 LOT RATTACHER-EN-ECRIVANT — l'ÉCHANGE de cette ligne est-il marqué « Interne » ? Un échange entre
   * collègues, sans bien à rattacher.
   *
   * ⚠️ IL PORTE SUR L'ÉCHANGE ET NON SUR LE MAIL, à la différence de `horsGestion` juste au-dessus. C'est ce qui
   * fait que la réponse d'un collègue, reçue demain, porte la même capsule sans aucun geste de plus.
   *
   * ⚠️ `false` QUAND LA MIGRATION 281 MANQUE — on n'invente pas un état qu'on n'a pas lu.
   */
  interne?: boolean;
  /** Référence `GES-…` de la carte si l'échange y est affecté, sinon `null`. */
  reference: string | null;
  /** L'échange a-t-il été classé sans suite ? L'écran le DIT : la boîte montre tout, elle n'efface rien. */
  sansSuite: boolean;
  /**
   * LOT ENVOI-DIAG — un message de cet échange n'est pas arrivé, et le serveur d'en face l'a dit.
   *
   * 🔴 C'EST LA SEULE CHOSE QU'ON NE PEUT PAS APPRENDRE EN OUVRANT L'ÉCHANGE PLUS TARD : un envoi refusé se voit sur
   * la LIGNE, sans quoi il faut ouvrir les 6 580 échanges d'Envoyés pour espérer tomber dessus. `null` = rien à
   * signaler, ce qui est le cas général — et le cas où la migration 261 n'est pas appliquée.
   */
  nonRemise: MentionNonRemise | null;
  /**
   * 🔴 LOT LIGNE-NON-ENVOYE — un mail de cet échange N'EST PAS PARTI, et il est retourné en brouillon.
   *
   * MÊME RAISON QUE `nonRemise` juste au-dessus : c'est une chose qu'on ne peut pas apprendre en ouvrant
   * l'échange plus tard. Sans elle, il faudrait ouvrir les 6 580 échanges d'« Envoyés » pour espérer tomber sur
   * celui qui n'est pas parti. `null` = rien à signaler — le cas général, et celui où la migration 271 manque.
   *
   * ⚠️ ELLE DISPARAÎT D'ELLE-MÊME quand le message est renvoyé avec succès : la règle est dans la requête
   * (`SQL_ECHEC_NON_RESOLU`), pas dans une écriture au moment du renvoi.
   */
  nonEnvoye?: MentionNonEnvoye | null;
  /**
   * ══ 🔴 LOT BOITE-INTERNE-CORBEILLE — COMBIEN DE MAILS DE CET ÉCHANGE SONT À LA CORBEILLE ════════════════════
   * Rendu UNIQUEMENT sous l'étiquette « Corbeille » (ailleurs `0` : la colonne n'est pas calculée, et souvent pas
   * même nommée). La ligne représente un ÉCHANGE, et « Supprimer définitivement » agira sur TOUS ses mails
   * supprimés : la confirmation doit donc annoncer le nombre de MAILS, pas le nombre de lignes cochées. Une
   * question qui annonce « 3 mails » avant d'en effacer 7 est pire qu'une absence de question.
   */
  nbCorbeille?: number;
}

export interface PageBoite {
  lignes: LigneBoite[];
  /** Curseur à renvoyer pour la page suivante. `null` = il n'y a plus rien après. */
  suivant: CurseurBoite | null;
  /** Nombre TOTAL d'échanges de la boîte. Calculé à part, et seulement à la première page. */
  total: number | null;
}

/**
 * LE CORRESPONDANT, ET POURQUOI CE N'EST PAS SIMPLEMENT L'EXPÉDITEUR DU DERNIER MESSAGE. 70 % du flux est SORTANT :
 * prendre l'expéditeur du dernier message afficherait « gestion@criterimmo.fr » sur les deux tiers des lignes, ce qui
 * ne renseigne sur rien. On cherche donc le dernier message REÇU de l'échange — la personne d'en face. S'il n'y en a
 * aucun (échange où nous n'avons fait qu'écrire), on retombe sur les DESTINATAIRES du dernier message : là encore,
 * c'est l'autre partie.
 */
const SQL_INTERLOCUTEUR = `
  LEFT JOIN LATERAL (
    SELECT r.de_adresse, r.de_nom
      FROM gestion_message r
     WHERE r.fil_id = p.fil_id AND r.sens = 'recu'
     ORDER BY r.recu_le DESC, r.id DESC
     LIMIT 1
  ) i ON true`;

/**
 * LOT BOITE-SENS — LE SENS QUE L'ÉTIQUETTE IMPOSE AU MESSAGE AFFICHÉ SUR LA LIGNE. PUR.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CETTE FONCTION EST TOUTE LA NOUVELLE RÈGLE — décision d'Arno du 26/09/2026, qui REMPLACE l'exclusivité du
 * 25/09 (« un échange ne va que dans une seule boîte, selon son dernier message »). Cette règle-là était fausse :
 * répondre à un mail le faisait DISPARAÎTRE de la Réception, alors qu'il y est toujours arrivé. Gmail ne fait pas
 * ça, et personne ne s'attend à ce qu'une réponse effface la question.
 *
 * LA RÈGLE, MAINTENANT, EST CELLE DE GMAIL :
 *   · Réception = tout échange contenant AU MOINS UN message reçu. La ligne montre le DERNIER message REÇU.
 *   · Envoyés   = tout échange contenant AU MOINS UN message envoyé. La ligne montre le DERNIER message ENVOYÉ.
 *   · Un échange où l'on a reçu ET répondu est dans LES DEUX, chacune avec SON message.
 *
 * 🔴 ET CE N'EST PAS UN FILTRE DE PLUS : c'est le même parcours, borné au sens. Le prédicat « ce message est le
 * dernier de son échange » devient « le dernier de son échange DANS CE SENS » — le sens entre aux DEUX étages
 * (`m` et `m2`), et c'est ce qui fait qu'une ligne de Réception ne peut pas emprunter la date, l'expéditeur ni
 * l'extrait d'un message que nous avons écrit. Les mettre au même endroit est ce qui rend la chose vraie : les
 * dissocier ferait ressortir un échange sur son dernier message reçu tout en le triant sur un envoi.
 *
 * ⚠️ LES AUTRES ÉTIQUETTES NE SONT PAS TOUCHÉES (`null`). « À classer », « Sans suite », « Courrier automatique »,
 * « Corbeille » et les cartes continuent de raisonner sur le dernier message de l'échange, quel qu'en soit le sens
 * — c'est leur définition, et elle n'a pas changé.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function sensDeLEtiquette(e: Etiquette): 'recu' | 'envoye' | null {
  if (e.sorte === 'reception') return 'recu';
  if (e.sorte === 'envoyes') return 'envoye';
  return null;
}

interface LigneDB {
  fil_id: string;
  /**
   * LOT MESSAGE-CLIQUÉ — le message de la ligne, rendu en CHAÎNE comme tout `bigint` par `pg`. Typé `string` pour
   * que la conversion soit obligatoire : le piège du dépôt (« dossierId bigint = chaîne ») a déjà fait comparer des
   * chaînes à des nombres, et ici la valeur sert à désigner un message dans le DOM.
   */
  message_id: string;
  objet: string | null;
  interlocuteur: string | null;
  /** Adresse de l'interlocuteur (dernier message REÇU), ou `null` si l'échange ne contient que des envois. */
  interlocuteur_adresse: string | null;
  dernier_sens: string;
  dernier_le: string;
  extrait: string | null;
  nb_messages: number;
  nb_lisibles: number;
  nb_pieces: number;
  /** LOT BOITE-INTERNE-CORBEILLE — combien de mails de cet échange sont à la corbeille. `0` hors de son étiquette. */
  nb_corbeille: number;
  reference: string | null;
  sans_suite: boolean;
  /** LOT CAPSULE-STATUT — rendus par la jointure latérale ; tous `null` quand la migration 257 est absente. */
  cl_n: number | null;
  cl_humain: boolean | null;
  cl_detail: string | null;
  /** LOT STATUT-HORS-GESTION — `null` quand la migration 266 manque : aucune capsule grise n'est alors rendue. */
  hg_marque: boolean | null;
  /** LOT RATTACHER-EN-ECRIVANT — `null` quand la migration 281 est absente : la table n'est nommée nulle part. */
  itn_marque: boolean | null;
  hg_motif: string | null;
}

/**
 * LOT 5-FUSION — LES ÉTIQUETTES DE LA BOÎTE, côté base.
 *
 * 🔴 CHAQUE ÉTIQUETTE EST UN FILTRE, JAMAIS UNE COLONNE. Rien n'est écrit nulle part : « Envoyés » ou « Sans suite »
 * se DÉRIVENT à la lecture, exactement comme « attend une réponse » depuis le lot 2. Une étiquette stockée mentirait
 * dès le message suivant — et il faudrait alors la rattraper à chaque capture, à chaque déplacement, à chaque
 * classement. Ici, changer l'état d'un échange change son étiquette sans qu'aucun code ne s'en occupe.
 *
 * 🔴 LE FILTRE ENTRE DANS LE CTE `page`, PAS APRÈS. C'est ce qui garde la requête rapide : il restreint le parcours
 * AVANT que le `LIMIT` compte ses trente lignes. Posé dans le `SELECT` final, il ferait lire trente échanges pour
 * n'en garder que deux, et la page suivante repartirait du mauvais endroit.
 *
 * ⚠️ UN SEUL paramètre lié supplémentaire, toujours `$4`, et seulement pour les deux étiquettes qui en ont besoin :
 * PostgreSQL REFUSE une requête à qui l'on passe plus de paramètres qu'elle n'en utilise. Voir `parametresEtiquette`.
 */
const ETIQUETTE_TOUT: Etiquette = { sorte: 'reception', evenementId: null };

/**
 * ══ 🔴🔴 « CET ÉCHANGE PORTE UNE ÉTOILE » — RÈGLE RÉÉCRITE LE 29/09/2026 (lot ETOILE-ET-SIGNATURE) ═════════════
 *
 * Écrite UNE fois, lue par la liste ET par le compteur : un compteur qui compterait autrement finirait par
 * annoncer un nombre que la liste ne montre pas — et c'est toujours le compteur qu'on croit.
 *
 * CE QU'ELLE LISAIT, ET POURQUOI CE N'ÉTAIT PAS CE QU'ON VOYAIT. Jusqu'à ce lot, elle interrogeait
 * `gestion_fil_etoile` — l'étoile de l'ÉQUIPE, une table à nous que Gmail ne connaît pas. Or l'étoile qu'on POSE,
 * dans la conversation, est celle de GMAIL (libellé STARRED sur un message). Deux étoiles, et rien ne le disait.
 *
 *     étoiles dans GMAIL (API, « is:starred »)  →  611 messages
 *     étoiles vues par ce prédicat              →    0 échange (8 lignes en table, aucune à `true`)
 *
 * Constat d'Arno, exactement : un message étoilé en toutes lettres dans le fil 334, et un filtre qui ne renvoie
 * rien. Décision d'Arno : UNE SEULE ÉTOILE, CELLE DE GMAIL — « dès qu'AU MOINS UN message est étoilé », comme
 * dans Gmail, et dans TOUTES les catégories.
 *
 * ⚠️ LE PRÉDICAT PORTE SUR L'ÉCHANGE, PAS SUR LA LIGNE. Une étoile posée sur le message du 18 septembre doit faire
 * remonter l'échange entier, même si la ligne montre celui du 24 : c'est la règle de Gmail, et c'était l'autre
 * moitié du défaut — un filtre qui n'aurait regardé que le dernier message aurait raté celui d'Arno.
 *
 * ⚠️ SANS LA MIGRATION 277, on retombe MOT POUR MOT sur l'ancien prédicat : la colonne n'est nommée nulle part, et
 * le filtre se comporte exactement comme avant ce lot.
 */
function sqlEtoile(etoileGmail: boolean): string {
  return etoileGmail
    ? `EXISTS (SELECT 1 FROM gestion_message me WHERE me.fil_id = m.fil_id AND me.etoile_le IS NOT NULL)`
    : `EXISTS (SELECT 1 FROM gestion_fil_etoile fe WHERE fe.fil_id = m.fil_id AND fe.etoilee)`;
}

/**
 * ══ 🔴 LOT BOITE-INTERNE-CORBEILLE — « CE MESSAGE EST À LA CORBEILLE DE GMAIL » ═════════════════════════════════
 *
 * Écrit UNE fois, lu partout : l'étiquette « Corbeille » en prend la forme positive, toutes les autres sa négation.
 * Exactement la grammaire de `SQL_EST_SPAM`, et pour la même raison — deux écritures finiraient par se contredire
 * et laisseraient un message invisible partout, ou, pire, un mail supprimé en Réception.
 *
 * ═══ CE QUE CETTE LIGNE REMPLACE, ET POURQUOI ════════════════════════════════════════════════════════════════════
 * Jusqu'au 29/09/2026, elle lisait `gestion_fil.corbeille_le` (migration 251) : une corbeille INTERNE, par ÉCHANGE,
 * dont l'appartenance se DÉRIVAIT d'une comparaison de dates (« le geste est-il postérieur au dernier message ? »),
 * ce qui donnait gratuitement le retour automatique d'un échange qui reçoit un nouveau message.
 *
 * Cette élégance-là n'a plus d'objet : l'état n'est plus le nôtre, c'est celui de GMAIL, et il est posé sur des
 * MESSAGES — une conversation peut parfaitement avoir un message à la corbeille et trois autres dans la boîte,
 * c'est même le cas courant quand on fait le ménage dans un long fil. Il n'y a donc plus rien à dériver : la
 * relève relit la corbeille de Gmail à chaque passe, pose la colonne et la retire. Et le « retour automatique »
 * n'a pas disparu — il est devenu littéral : sortir un mail de la corbeille dans Gmail le fait revenir chez nous
 * à la passe suivante, parce que c'est Gmail qui dit la vérité.
 *
 * ⚠️ LA COLONNE DE LA 251 N'EST PLUS NOMMÉE NULLE PART, mais elle n'est pas effacée (voir la migration 275).
 */
const SQL_EN_CORBEILLE = 'm.corbeille_le IS NOT NULL';

/**
 * LOT ERGO-BOITE-3 — « CE MESSAGE EST DU SPAM ». Écrit UNE fois, lu partout : l'étiquette « Spam » en prend la forme
 * positive, toutes les autres sa négation. Deux écritures finiraient par se contredire et laisseraient un message
 * invisible partout — ou, pire, un spam en Réception.
 */
const SQL_EST_SPAM = 'm.spam_le IS NOT NULL';

/**
 * ══ 🔴 LOT BOITE-INTERNE-CORBEILLE — « CE MESSAGE EST DANS NOTRE RÉCEPTION » ══════════════════════════════════════
 *
 * RÈGLE D'ARNO, 29/09/2026 : un message ENVOYÉ PAR gestion@ — depuis l'app comme depuis Gmail, file d'envoi en
 * arrière-plan comprise — n'apparaît QUE dans « Envoyés »… SAUF SI gestion@ figure elle-même dans À, Cc ou Cci.
 * C'est mot pour mot la règle de Gmail : quand on s'écrit à soi-même, le message est dans les deux endroits.
 *
 * ═══ CE QUI ÉTAIT VRAI AVANT CE LOT, ET CE QUI NE L'ÉTAIT PAS ════════════════════════════════════════════════════
 * La première moitié tenait déjà, et solidement : `sens` est posé par `sensDuMessage` (capture.ts) sur la seule
 * comparaison « l'expéditeur EST-IL gestion@ ? ». Vérifié sur la vraie base le 29/09/2026 : **40 063 messages
 * partis de gestion@, 40 063 marqués `envoye`, ZÉRO marqué `recu`**. Aucun envoi n'a jamais fuité en Réception.
 *
 * La SECONDE moitié — l'exception — n'existait pas. `sens` ne regarde QUE l'expéditeur : un mail que nous nous
 * adressions à nous-mêmes restait `envoye`, donc invisible en Réception alors que Gmail l'y dépose. Mesuré :
 * **51 messages dans 49 échanges**, dont **32 échanges qui n'avaient aucun autre message reçu** — ils n'étaient
 * donc visibles nulle part ailleurs que sous « Envoyés ». Ce sont de vrais courriers : des envois groupés où les
 * locataires sont en Cci et où gestion@ est le destinataire visible (coupure d'eau, date d'AG, information
 * chauffage), et des notes qu'on s'envoie à soi-même.
 *
 * 🔴 ON NE TOUCHE PAS À `sens`, ET C'EST DÉLIBÉRÉ. Ces messages sont bel et bien ENVOYÉS ; réécrire leur sens pour
 * les faire entrer en Réception les ferait sortir d'Envoyés, où ils ont toute leur place. « Être dans la
 * Réception » n'est pas un sens, c'est une APPARTENANCE — et un message peut appartenir aux deux, exactement
 * comme un échange où l'on a reçu ET répondu depuis le lot BOITE-SENS.
 *
 * ⚠️ LES TROIS CHAMPS, PAS DEUX. `dest_cci` compte autant que `dest_a` et `dest_cc` : c'est précisément la forme
 * des envois groupés ci-dessus. Les trois colonnes sont peuplées sur 100 % des envois (vérifié : 0 `dest_a` nul
 * sur 40 063), donc aucun repli sur le texte `destinataires` n'est nécessaire — et un repli par sous-chaîne
 * rapprocherait « gestion@criterimmo.fr » de « ancienne-gestion@criterimmo.fr ».
 *
 * ⚠️ L'ADRESSE ARRIVE EN PARAMÈTRE LIÉ, jamais interpolée : elle vient de `gestion_config`, donc de la base.
 */
export function sqlNousEstAdresse(alias: string, rang: number): string {
  return `EXISTS (SELECT 1 FROM jsonb_array_elements(
                         coalesce(${alias}.dest_a, '[]'::jsonb)
                      || coalesce(${alias}.dest_cc, '[]'::jsonb)
                      || coalesce(${alias}.dest_cci, '[]'::jsonb)) dn
                   WHERE lower(dn ->> 'adresse') = $${rang})`;
}

/**
 * LE PRÉDICAT D'APPARTENANCE À UNE BOÎTE, écrit UNE fois et lu par la liste, les DEUX compteurs et la recherche.
 *
 * 🔴 UNE SEULE ÉCRITURE, PARCE QUE C'EST LA LEÇON DU LOT BOITE-SENS : un compteur « équivalent mais écrit
 * autrement » finit par annoncer un nombre que la liste ne montre pas — et c'est toujours le compteur qu'on croit.
 *
 * `rangAdresse` à `null` = l'appelant n'a pas d'adresse à lier (ancien comportement, et le cas d'« Envoyés ») :
 * le prédicat retombe alors EXACTEMENT sur `sens = '…'`, mot pour mot ce qui s'écrivait avant ce lot.
 */
export function sqlAppartenance(alias: string, sens: 'recu' | 'envoye', rangAdresse: number | null): string {
  if (sens === 'envoye' || rangAdresse === null) return `${alias}.sens = '${sens}'`;
  return `(${alias}.sens = 'recu' OR ${sqlNousEstAdresse(alias, rangAdresse)})`;
}


/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT RECHERCHE-LIGNES — LES FRAGMENTS QUE LA LISTE ET LA RECHERCHE PARTAGENT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   Constat d'Arno : dans les résultats de recherche, « il manque le trombone avec le nombre de pièces et la capsule
   de statut ». Le COMPOSANT de ligne était pourtant déjà le même — c'est la DONNÉE qui différait : la recherche
   rendait piecesDuMessage: 0, piecesAilleurs: 0 et classement: null, si bien que la ligne affichait fidèlement…
   rien.

   🔴 D'OÙ CES FRAGMENTS. Les recopier dans la requête de recherche aurait donné deux écritures de la même règle —
   « qu'est-ce qu'un échange classé ? », « qu'est-ce qu'un mail hors gestion ? » — qui auraient fini par ne plus
   dire la même chose, et l'on aurait cherché longtemps laquelle a raison. Une seule écriture, deux emplois.

   ⚠️ L'ALIAS EST UN PARAMÈTRE : les deux requêtes ne nomment pas leur CTE pareil (page ici, trouves dans la
   recherche). Rien d'autre ne change.
   ⚠️ SONDE ABSENTE ⇒ CHAÎNE VIDE : la table n'est alors NOMMÉE NULLE PART, et la requête est mot pour mot celle
   d'avant la migration. C'est la règle du module.
*/

/**
 * ══ 🔴 LOT CAPSULE-STATUT — LE STATUT DANS LA MÊME REQUÊTE, PAS UNE PAR LIGNE ═════════════════════════════════
 * Une jointure LATÉRALE sur les 30 lignes de la page, et rien de plus. Trente requêtes — une par ligne — se
 * verraient à l'écran ; c'est la règle du module depuis le bandeau « Rattaché à » de la conversation.
 *
 * ⚠️ ON NE COMPTE QUE LES RATTACHEMENTS `confirme`, ET SEULEMENT VERS UN LOGEMENT OU UN PROPRIÉTAIRE. Une
 * PROPOSITION que personne n'a validée laisse l'échange « à classer » — c'est exactement ce qu'il est. Les
 * rattachements vers un ÉVÉNEMENT ne comptent pas non plus : c'est l'autre question, celle de la colonne de
 * gauche (mesuré le 27/09 : 474 échanges sans événement, 9 631 sans rattachement — deux nombres distincts).
 *
 * ⚠️ « À LA MAIN » = origine manuelle OU statut touché par quelqu'un. Les deux chemins mènent au même fait : un
 * humain a tranché. Ne regarder que `origine` raterait toutes les propositions confirmées d'un clic.
 *
 * ⚠️ Sans la migration 257, la table n'est NOMMÉE NULLE PART et la requête est mot pour mot celle d'avant.
 */
export function sqlJointureClassement(rattachements: boolean, alias: string): string {
  return !rattachements ? '' : `LEFT JOIN LATERAL (
         SELECT count(*)::int AS n,
                bool_or(r.origine = 'manuel' OR r.statut_par_libelle IS NOT NULL) AS humain,
                string_agg(
                  coalesce(nullif(btrim(r.cible_libelle), ''), r.cible_cle, 'cible ' || r.cible_id::text)
                  || CASE WHEN r.origine = 'manuel' OR r.statut_par_libelle IS NOT NULL
                          THEN ' — à la main' ELSE ' — automatique' END,
                  ' · ' ORDER BY r.id) AS detail
           FROM gestion_rattachement r
           JOIN gestion_message rm ON rm.id = r.message_id
          WHERE rm.fil_id = ${alias}.fil_id AND r.statut = 'confirme'
            AND r.cible_sorte IN ('lot', 'proprietaire')
       ) cl ON true`;
}

/**
 * ══ 🔴 LOT STATUT-HORS-GESTION — « CE MAIL NE CONCERNE AUCUN BIEN » ══════════════════════════════════════════
 * La marque est posée SUR UN MAIL, et la ligne de liste EST un mail (celui que `page` a retenu, lot
 * MESSAGE-CLIQUÉ) : on la lit donc sur `p.message_id`, pas sur tout l'échange. Griser une conversation entière
 * parce qu'un seul de ses douze mails est une prospection dirait le contraire de ce que quelqu'un a décidé.
 *
 * ⚠️ ELLE NE L'EMPORTE JAMAIS SUR UN RATTACHEMENT : c'est `capsuleStatut` (module PUR) qui tranche, et la
 * priorité y est Classé > Auto > Hors gestion > À classer. Cette jointure ne fait que RAPPORTER le fait.
 *
 * ⚠️ Sans la migration 266, la table n'est NOMMÉE NULLE PART et la requête est mot pour mot celle d'avant.
 */
export function sqlJointureHorsGestion(horsGestion: boolean, alias: string): string {
  return !horsGestion ? '' : `LEFT JOIN LATERAL (
         SELECT h.motif
           FROM gestion_hors_gestion h
          WHERE h.message_id = ${alias}.message_id AND h.retire_le IS NULL
          LIMIT 1
       ) hg ON true`;
}

/**
 * NOTRE ADRESSE, telle que la relève la connaît. `gestion_config.adresse_gestion` et RIEN D'AUTRE.
 *
 * 🔴 LA MÊME SOURCE QUE `sensDuMessage` (capture.ts), et c'est le point : si cette lecture-ci et celle de la
 * capture pouvaient diverger, un message serait marqué « envoyé » par l'une et « nous est adressé » par l'autre.
 * On passe donc par `chargerConfigGestion`, qui porte déjà le repli et la normalisation (minuscules, espaces).
 *
 * ⚠️ NON MÉMOÏSÉE, DÉLIBÉRÉMENT : c'est une lecture d'UNE ligne par clé primaire, et une adresse de gestion qu'on
 * changerait en base doit prendre effet au rechargement suivant, pas au redémarrage du serveur.
 */
async function adresseDeLaGestion(): Promise<string> {
  return (await chargerConfigGestion()).adresseGestion;
}

/**
 * ⚠️ LOT LISTE-PAGINATION — `rangParam` AU LIEU DE `$4` ÉCRIT EN DUR. Deux requêtes emploient désormais ce
 * prédicat : la PAGE (où le paramètre de l'étiquette vient après le curseur et le `LIMIT`, donc en 4e position) et
 * son COMPTE (qui n'a ni curseur ni `LIMIT`, donc en 1re). Le rang par défaut est 4 : les appels d'avant ce lot
 * rendent une chaîne IDENTIQUE AU CARACTÈRE PRÈS, et les épreuves qui figent la forme du SQL de la page tiennent.
 */
function sqlEtiquette(e: Etiquette, corbeille: boolean, spam: boolean, rangParam = 4): string {
  switch (e.sorte) {
    /**
     * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
     * 🔴 RÉCEPTION ET ENVOYÉS N'ONT PLUS DE FILTRE ICI — LOT BOITE-SENS, 26/09/2026.
     *
     * Leur règle est devenue celle de `sensDeLEtiquette` : elle borne le PARCOURS au sens, aux deux étages, au
     * lieu de poser une condition sur le dernier message de l'échange. Écrire ici `AND m.sens = 'recu'` en plus
     * serait la même chose dite deux fois — donc, un jour, deux choses différentes.
     *
     * CE QUE CETTE PLACE VIDE REMPLACE. Du 25 au 26/09, elle portait l'EXCLUSIVITÉ : « le dernier message décide,
     * jamais les deux boîtes ». Cette règle faisait disparaître un échange de la Réception dès qu'on y répondait,
     * alors qu'il y est toujours arrivé — Arno a demandé de la remplacer, et c'est le seul retrait de ce lot.
     *
     * 🔴 « NOUS », C'EST `gestion_config.adresse_gestion`, ET RIEN D'AUTRE — cela n'a pas changé. `sens` porte
     * déjà exactement cette règle (`sensDuMessage`, capture.ts) : un collègue de @sansvisavis.com qui écrit à
     * gestion@ est un message REÇU. Confondre « interne » et « nous » ferait disparaître de la boîte les
     * demandes des collègues.
     * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
     */
    case 'reception':
      return '';
    // « À classer » = la règle du poste de tri : échange encore à classer, et dernier message lisible dans la fenêtre
    //   d'activité. `m` EST ce dernier message lisible (le parcours ne garde que lui), donc le test de date porte sur
    //   la même date que `lireFile`. $4 = la fenêtre en jours, lue en base comme là-bas.
    //   MESURÉ le 24/09/2026 sur la vraie base : 430 échanges des deux côtés, à l'unité.
    //
    //   ⚠️ UNE NUANCE, ET IL FAUT LA CONNAÎTRE. `lireFile` cherche le dernier message ENCORE ATTACHÉ à l'échange
    //   (un mail déplacé vers une carte n'y compte plus) ; le parcours de la boîte, lui, cherche le dernier message
    //   de l'échange, déplacé ou non — c'est le parcours du lot 5a, commun à TOUTES les étiquettes, et le rendre
    //   différent pour une seule d'entre elles créerait l'incohérence qu'on veut éviter. Écart mesuré aujourd'hui :
    //   0 échange (0 mail déplacé actif en base).
    //
    //   🔴 ET SURTOUT : L'ÉCRAN N'EMPRUNTE PAS CE CHEMIN. Sous l'étiquette « À classer », le plein écran rend le
    //   POSTE DE TRI lui-même (voir `PleinEcranBoite`), pas cette lecture. Les deux ne peuvent donc pas se
    //   contredire devant l'utilisateur. Ce filtre ne sert qu'à qui appellerait la route directement.
    case 'a_classer':
      return `AND m.recu_le >= now() - ($${rangParam}::int * interval '1 day')
          AND EXISTS (SELECT 1 FROM gestion_fil f0 WHERE f0.id = m.fil_id AND f0.etat = 'a_classer')`;
    // « Envoyés » : le PENDANT EXACT de Réception, et pour la même raison sans filtre ici. Voir ci-dessus.
    case 'envoyes':
      return '';
    case 'sans_suite':
      return `AND EXISTS (SELECT 1 FROM gestion_fil f0 WHERE f0.id = m.fil_id AND f0.etat = 'sans_suite')`;
    // « Courrier automatique » = les échanges dont AUCUN message n'est lisible. Même définition que le compteur
    //   `comptesBoite`, pour que l'étiquette et son nombre ne racontent jamais deux histoires différentes.
    case 'automatique':
      return `AND NOT EXISTS (SELECT 1 FROM gestion_message ml WHERE ml.fil_id = m.fil_id AND ml.exclu_le IS NULL)`;
    // LOT 5e — « Brouillons » ne sort PAS de `gestion_message` : un brouillon n'est pas un message reçu. L'écran le
    //   sert depuis `gestion_brouillon`, et ne demande donc jamais cette liste-ci. Le prédicat impossible est un
    //   garde-fou : si quelqu'un appelait quand même, il rendrait une liste VIDE plutôt qu'une liste FAUSSE.
    case 'brouillons':
      return 'AND false';
    // LOT ERGO-BOITE-3 — « Spam » : la forme POSITIVE de l'exclusion posée sur toutes les autres étiquettes.
    //   ⚠️ SANS LA MIGRATION 263, ON NE NOMME PAS LA COLONNE — même raison que la corbeille ci-dessous : quelqu'un
    //   peut arriver ici par une adresse enregistrée, et nommer une colonne absente ferait échouer TOUTE la boîte.
    //   Le prédicat impossible rend une liste VIDE, ce qui est vrai tant que rien n'a été relevé.
    case 'spam':
      return spam ? `AND ${SQL_EST_SPAM}` : 'AND false';
    // LOT BOITE-INTERNE-CORBEILLE — « Corbeille » : le seul endroit qui MONTRE ce que les autres écartent. Le
    //   filtre y est la forme POSITIVE exacte de l'exclusion posée sur toutes les autres étiquettes — écrites au
    //   même endroit, elles ne peuvent pas diverger et laisser un message invisible partout.
    case 'corbeille':
      // ⚠️ SANS LA MIGRATION 275, ON NE NOMME PAS LA COLONNE — pas même ici. Quelqu'un peut arriver sur cette
      //   étiquette par une adresse enregistrée : nommer une colonne absente ferait échouer TOUTE la boîte, pas
      //   seulement cette liste. Le prédicat impossible rend une liste VIDE, comme pour « Brouillons ».
      return corbeille ? `AND ${SQL_EN_CORBEILLE}` : 'AND false';
    // Une CARTE : ses échanges rattachés. `message_id IS NULL` — une affectation de MAIL isolé n'est pas un échange
    //   rattaché, et la compter ici ferait apparaître dans l'étiquette un échange qui appartient à une autre carte.
    case 'carte':
      return `AND EXISTS (SELECT 1 FROM gestion_affectation a0
                            WHERE a0.fil_id = m.fil_id AND a0.actif AND a0.message_id IS NULL
                              AND a0.evenement_id = $${rangParam}::bigint)`;
  }
}

/** Le paramètre `$4` que l'étiquette réclame — au plus un, jamais un de trop (voir l'encadré ci-dessus). */
export function parametresEtiquette(e: Etiquette, fenetreJours: number): number[] {
  if (e.sorte === 'a_classer') return [fenetreJours];
  if (e.sorte === 'carte') return [e.evenementId ?? 0];
  return [];
}

/**
 * ══ 🔴🔴 LOT LISTE-PAGINATION — LE PRÉDICAT DE LA LISTE, ÉCRIT UNE SEULE FOIS ════════════════════════════════════
 *
 * Il répond à « quels messages sont les lignes de cette liste ? », et RIEN d'autre : ni ce qu'on affiche de chacun,
 * ni dans quel ordre, ni combien. Deux requêtes l'emploient, et c'est tout l'objet de cette extraction :
 *
 *   · `sqlPageBoite`   — la page qu'on montre (avec curseur, tri et `LIMIT`) ;
 *   · `sqlCompteBoite` — COMBIEN il y en a en tout (sans curseur, sans tri, sans `LIMIT`).
 *
 * 🔴 POURQUOI PAS DEUX ÉCRITURES « ÉQUIVALENTES ». Le dépôt a déjà payé cette leçon et l'a écrite dans
 * `compterBoite` : « un compteur calculé autrement mais équivalent annonce tôt ou tard un nombre que la liste ne
 * montre pas — et c'est toujours le compteur qu'on croit ». La pagination affiche « 1–25 sur N » juste au-dessus
 * des lignes : N et les lignes DOIVENT sortir du même prédicat, sinon la dernière page est vide ou inatteignable.
 *
 * ⚠️ LA SORTIE EST IDENTIQUE, AU CARACTÈRE PRÈS, à ce que `sqlPageBoite` composait avant ce lot — les fragments
 * ont changé de maison, pas de contenu. C'est ce qui permet aux épreuves qui figent la forme du SQL de la page de
 * rester vertes sans être réécrites.
 */
function predicatsBoite(
  inclureAutomatiques: boolean, etiquette: Etiquette, corbeille: boolean, spam: boolean,
  rangFilsRetenus: number | null, etoilesSeules: boolean, rangAdresseGestion: number | null,
  etoileGmail: boolean, rangEtiquette: number,
): {
  sens: 'recu' | 'envoye' | null; montreLaCorbeille: boolean;
  filtreM: string; filtreM2: string; filtreEtiquette: string;
  filtreSensM: string; filtreSensM2: string;
  filtreCorbeille: string; filtreCorbeilleM2: string;
  filtreSpamM: string; filtreSpamM2: string;
  filtreRetenus: string; filtreEtoile: string;
} {
  // Le filtre s'applique AUX DEUX ÉTAGES du parcours (le message candidat, et le « y a-t-il plus récent ? ») : les
  //   dissocier ferait sortir un échange dont le dernier message est écarté, avec l'avant-dernier comme aperçu.
  const filtreM = inclureAutomatiques ? '' : 'AND m.exclu_le IS NULL';
  const filtreM2 = inclureAutomatiques ? '' : 'AND m2.exclu_le IS NULL';
  const filtreEtiquette = sqlEtiquette(etiquette, corbeille, spam, rangEtiquette);
  /**
   * LOT BOITE-SENS — LE SENS, AUX DEUX ÉTAGES. `null` (toutes les autres étiquettes) ⇒ chaînes vides, et la
   * requête est alors mot pour mot celle d'avant ce lot.
   *
   * 🔴 LE MÊME SENS DANS `m` ET DANS `m2`, ET C'EST LE POINT ENTIER DU LOT. Dans `m2` — le prédicat « existe-t-il
   * plus récent ? » —, il transforme « le dernier message de l'échange » en « le dernier message de l'échange DANS
   * CE SENS ». Sans lui, un échange auquel on a répondu n'aurait plus aucun candidat en Réception : son dernier
   * message reçu serait écarté par l'envoi qui le suit, et l'échange sortirait de la boîte — le défaut même qu'on
   * répare. Le mettre dans `m` seul, à l'inverse, rendrait la ligne sur le bon message mais triée sur le mauvais.
   */
  const sens = sensDeLEtiquette(etiquette);
  /**
   * ⚠️ LOT BOITE-INTERNE-CORBEILLE — `sens` DEVIENT UNE APPARTENANCE (voir `sqlAppartenance`). Sous « Réception »,
   * un message que NOUS avons envoyé mais qui nous est AUSSI adressé en fait partie : c'est la règle de Gmail, et
   * c'est ce qui rend 32 échanges visibles là où ils sont réellement arrivés. Le prédicat entre toujours aux DEUX
   * étages — le dissocier ferait ressortir un échange sur un message et le trier sur un autre.
   */
  const filtreSensM = sens === null ? '' : `AND ${sqlAppartenance('m', sens, rangAdresseGestion)}`;
  const filtreSensM2 = sens === null ? '' : `AND ${sqlAppartenance('m2', sens, rangAdresseGestion)}`;
  /**
   * ══ 🔴 LOT BOITE-INTERNE-CORBEILLE — LA CORBEILLE EST ÉCARTÉE AUX DEUX ÉTAGES ══════════════════════════════════
   * Comme le spam, et pour la MÊME raison qu'on a déjà payée une fois : posée sur le seul message candidat,
   * l'exclusion laisserait un message supprimé jouer le rôle de « dernier message de l'échange ». La ligne
   * disparaîtrait de la Réception sans que rien ne l'explique — alors que le vrai dernier message, lui, est bien là.
   *
   * ⚠️ `corbeille` FAUX (migration 275 absente) ⇒ chaînes vides : la requête est mot pour mot celle d'avant ce lot.
   */
  const montreLaCorbeille = corbeille && etiquette.sorte === 'corbeille';
  const filtreCorbeille = !corbeille || montreLaCorbeille ? '' : 'AND m.corbeille_le IS NULL';
  /**
   * 🔴 SOUS « CORBEILLE », `m2` PORTE LA FORME POSITIVE — ET C'EST INDISPENSABLE, pas symétrique pour la beauté.
   *
   * Le prédicat `m2` dit « existe-t-il, dans cet échange, un message plus récent QUI COMPTE ? ». Laissé vide sous
   * l'étiquette « Corbeille », il compare le mail supprimé à TOUS les messages de son échange : un mail jeté au
   * milieu d'une conversation encore vivante aurait donc toujours un successeur, et n'apparaîtrait NULLE PART —
   * ni dans ses boîtes, qui l'écartent, ni dans la corbeille, qui ne le retiendrait pas. Une corbeille où l'on ne
   * retrouve pas ce qu'on y a mis n'est pas une corbeille.
   *
   * Avec la forme positive, la ligne est le DERNIER MAIL SUPPRIMÉ de son échange, et la liste compte une ligne
   * par échange concerné — la même grammaire que toutes les autres étiquettes de cette boîte.
   */
  const filtreCorbeilleM2 = !corbeille
    ? '' : montreLaCorbeille ? 'AND m2.corbeille_le IS NOT NULL' : 'AND m2.corbeille_le IS NULL';
  // LOT ERGO-BOITE-3 — le sélecteur « non lus ». Posé sur le seul étage `m` : il désigne des ÉCHANGES, pas des
  //   messages, et le prédicat « dernier de son sens » n'a pas à en tenir compte.
  const filtreRetenus = rangFilsRetenus === null ? '' : `AND m.fil_id = ANY($${rangFilsRetenus}::bigint[])`;
  // LOT FILTRE-ETOILE — posé sur le seul étage `m` : il désigne des ÉCHANGES, pas des messages. Le prédicat
  //   « dernier de son sens » n'a donc pas à en tenir compte.
  const filtreEtoile = etoilesSeules ? `AND ${sqlEtoile(etoileGmail)}` : '';
  /**
   * ══ 🔴 LOT ERGO-BOITE-3 — LE SPAM NE SORT DE NULLE PART, SAUF DE SON ÉTIQUETTE ═══════════════════════════════
   * Il est écarté AUX DEUX ÉTAGES du parcours, comme le courrier automatique et pour la même raison : posé sur le
   * seul message candidat, il laisserait un spam masquer le dernier vrai message d'un échange — la ligne
   * disparaîtrait de la Réception sans que rien ne l'explique.
   *
   * ⚠️ `spam` FAUX (migration 263 absente) ⇒ chaînes vides : la requête est alors mot pour mot celle d'avant ce lot.
   */
  const estSpam = spam && etiquette.sorte !== 'spam';
  return {
    sens, montreLaCorbeille, filtreM, filtreM2, filtreEtiquette, filtreSensM, filtreSensM2,
    filtreCorbeille, filtreCorbeilleM2, filtreRetenus, filtreEtoile,
    filtreSpamM: estSpam ? 'AND m.spam_le IS NULL' : '',
    filtreSpamM2: estSpam ? 'AND m2.spam_le IS NULL' : '',
  };
}

/**
 * LE SQL DE LA PAGE, EXTRAIT pour être EXPLAINABLE TEL QUEL. La règle du dépôt est qu'un plan se contrôle sur la
 * requête RÉELLEMENT ÉMISE, jamais sur une copie simplifiée — une copie dérive au premier changement, et la mesure
 * ment alors sans prévenir. `lireBoiteMail` et le banc d'épreuve appellent donc la MÊME fonction.
 * Paramètres liés : $1 = date du curseur, $2 = identifiant du curseur, $3 = nombre de lignes à lire.
 */
export function sqlPageBoite(
  inclureAutomatiques: boolean, etiquette: Etiquette = ETIQUETTE_TOUT, corbeille = false, spam = false,
  /** LOT ERGO-BOITE-3 — le rang du paramètre portant les fils retenus, ou `null` : aucun filtre. */
  rangFilsRetenus: number | null = null,
  /** LOT FILTRE-ETOILE — ne garder que les échanges étoilés. */
  etoilesSeules = false,
  /** LOT CAPSULE-STATUT — la migration 257 est-elle là ? Sinon aucune capsule, et pas une table nommée. */
  rattachements = false,
  /** LOT STATUT-HORS-GESTION — la migration 266 est-elle là ? Sinon aucune capsule grise, et pas une table nommée. */
  horsGestion = false,
  /**
   * LOT BOITE-INTERNE-CORBEILLE — le rang du paramètre portant NOTRE adresse, ou `null`. Voir `sqlAppartenance` :
   * `null` rend la requête mot pour mot celle d'avant ce lot, ce qui garde tous les tests de forme existants.
   */
  rangAdresseGestion: number | null = null,
  /**
   * 🔴 LOT ETOILE-ET-SIGNATURE — la migration 277 est-elle là ? Elle décide LAQUELLE des deux étoiles le filtre
   * lit (voir `sqlEtoile`). Sans elle, la requête est mot pour mot celle d'avant ce lot.
   */
  etoileGmail = false,
  /**
   * 🔴 LOT RATTACHER-EN-ECRIVANT — la migration 281 est-elle là ? Sinon `gestion_fil_interne` n'est NOMMÉE NULLE
   * PART et la requête est mot pour mot celle d'avant ce lot, ce qui garde les épreuves de forme existantes.
   */
  interne = false,
): string {
  /**
   * 🔴 LOT LISTE-PAGINATION — LE PRÉDICAT VIENT DE `predicatsBoite`, PARTAGÉ AVEC `sqlCompteBoite`. Ce qui suit ne
   * décrit plus QUI entre dans la liste (c'est là-bas), seulement ce qu'on AFFICHE de chaque ligne et dans quel
   * ordre. Les fragments sont les mêmes, au caractère près, qu'avant ce lot.
   */
  const {
    sens, montreLaCorbeille, filtreM, filtreM2, filtreEtiquette, filtreSensM, filtreSensM2,
    filtreCorbeille, filtreCorbeilleM2, filtreSpamM, filtreSpamM2, filtreRetenus, filtreEtoile,
  } = predicatsBoite(inclureAutomatiques, etiquette, corbeille, spam, rangFilsRetenus, etoilesSeules,
    rangAdresseGestion, etoileGmail, 4);
  /**
   * L'INTERLOCUTEUR SUIT LE MESSAGE AFFICHÉ, et il ne peut plus en être autrement.
   *
   * · un message REÇU : son expéditeur EST l'interlocuteur, lu directement sur `p` ;
   * · un message ENVOYÉ : l'autre partie est son DESTINATAIRE (« À : … »).
   *
   * ⚠️ `dest_a -> 0` : la première adresse « À », pour que le libellé d'un partenaire interne s'applique aussi
   * dans Envoyés. ET LE NOM DE LA PERSONNE, PAS SEULEMENT SON ADRESSE : nos propres envois écrivent `To: adresse`
   * sans nom — la ligne afficherait « a.jorel@sansvisavis.com » là où la Réception affiche « Arnaud », pour la même
   * personne et le même échange. On prend, dans l'ordre : le nom écrit dans « À » s'il y en a un ; sinon le nom
   * sous lequel CETTE personne nous a écrit DANS CET ÉCHANGE ; sinon le texte brut des destinataires.
   */
  const interlocuteurRecu = `coalesce(nullif(btrim(p.de_nom), ''), p.de_adresse)`;
  const interlocuteurEnvoye = `coalesce(nullif(btrim(p.dest_a -> 0 ->> 'nom'), ''),
                   CASE WHEN i.de_adresse = (p.dest_a -> 0 ->> 'adresse')
                        THEN nullif(btrim(i.de_nom), '') END,
                   nullif(btrim(p.destinataires), ''))`;
  /**
   * ══ 🔴 LOT BOITE-INTERNE-CORBEILLE — SOUS « RÉCEPTION », LA LIGNE PEUT ÊTRE UN ENVOI ════════════════════════
   * Depuis que Réception accueille les messages QUE NOUS NOUS SOMMES ADRESSÉS, `p.sens` n'y vaut plus
   * invariablement « recu » : lire l'expéditeur sans regarder le sens afficherait « Gestion CRITERIMMO » comme
   * correspondant de nos propres envois groupés. Le `CASE` suit donc le message, pas l'étiquette.
   *
   * ⚠️ ET LA JOINTURE LATÉRALE REVIENT SOUS RÉCEPTION. Elle avait disparu au lot BOITE-SENS parce qu'il n'y avait
   * plus rien à chercher ; il y a de nouveau quelque chose — le NOM du destinataire d'un envoi. Trente lignes de
   * page, une jointure latérale : le coût est celui qu'« Envoyés » paie depuis toujours.
   */
  const colonnesInterlocuteur = sens === 'recu' && rangAdresseGestion !== null
    ? `CASE WHEN p.sens = 'recu' THEN ${interlocuteurRecu} ELSE ${interlocuteurEnvoye} END AS interlocuteur,
            CASE WHEN p.sens = 'recu' THEN p.de_adresse ELSE (p.dest_a -> 0 ->> 'adresse') END AS interlocuteur_adresse,`
    : sens === 'recu'
      ? `${interlocuteurRecu} AS interlocuteur,
            p.de_adresse AS interlocuteur_adresse,`
      : sens === 'envoye'
        ? `${interlocuteurEnvoye} AS interlocuteur,
            (p.dest_a -> 0 ->> 'adresse') AS interlocuteur_adresse,`
        : `coalesce(nullif(btrim(i.de_nom), ''), i.de_adresse, nullif(btrim(p.destinataires), '')) AS interlocuteur,
            i.de_adresse AS interlocuteur_adresse,`;
  const jointureClassement = sqlJointureClassement(rattachements, 'p');
  const jointureHorsGestion = sqlJointureHorsGestion(horsGestion, 'p');
  // 🔴 LOT RATTACHER-EN-ECRIVANT — la marque « Interne » de l'ÉCHANGE, par la jointure écrite UNE fois dans
  //   `interneRepo`. Sans la 281, elle rend une chaîne vide et la requête est celle d'avant ce lot.
  const jointureInterne = sqlJointureInterne(interne, 'p');

  return `WITH page AS (
       SELECT m.fil_id, m.id AS message_id, m.recu_le, m.sens, m.de_adresse, m.de_nom, m.destinataires, m.dest_a,
              left(coalesce(m.corps_texte, ''), ${LONGUEUR_EXTRAIT}) AS extrait
         FROM gestion_message m
        WHERE (m.recu_le, m.fil_id) < ($1::timestamptz, $2::bigint)
          ${filtreM}
          ${filtreSensM}
          ${filtreEtiquette}
          ${filtreCorbeille}
          ${filtreSpamM}
          ${filtreRetenus}
          ${filtreEtoile}
          -- ⚠️ « ce message est le DERNIER de son échange » — ET, sous Réception ou Envoyés, le dernier DANS SON
          --    SENS. C'est CE prédicat qui transforme un parcours de messages en parcours d'échanges, et qui permet
          --    au LIMIT d'arrêter le travail. Servi par l'index (fil_id, recu_le).
          AND NOT EXISTS (
                SELECT 1 FROM gestion_message m2
                 WHERE m2.fil_id = m.fil_id ${filtreM2} ${filtreSensM2} ${filtreSpamM2} ${filtreCorbeilleM2}
                   AND (m2.recu_le, m2.id) > (m.recu_le, m.id))
        ORDER BY m.recu_le DESC, m.fil_id DESC
        LIMIT $3
     )
     SELECT p.fil_id::text AS fil_id,
            -- LOT MESSAGE-CLIQUÉ — le message que la ligne représente, déjà désigné par le CTE. En texte : c'est un
            --   bigint, et pg le rendrait en chaîne de toute façon ; l'écrire ici le dit à qui lit la requête.
            p.message_id::text AS message_id,
            f.objet_initial AS objet,
            ${colonnesInterlocuteur}
            p.sens AS dernier_sens,
            to_char(p.recu_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS dernier_le,
            p.extrait,
            (SELECT count(*) FROM gestion_message c WHERE c.fil_id = p.fil_id)::int AS nb_messages,
            (SELECT count(*) FROM gestion_message c WHERE c.fil_id = p.fil_id AND c.exclu_le IS NULL)::int AS nb_lisibles,
            -- LOT LISTE-GMAIL — le NOMBRE de pièces de l'échange, et non plus seulement « y en a-t-il ? ». Une
            --   seule lecture, servie par l'index (message_id) de gestion_piece ; le booléen s'en déduit.
            (SELECT count(*) FROM gestion_message pm JOIN gestion_piece pc ON pc.message_id = pm.id
              WHERE pm.fil_id = p.fil_id)::int AS nb_pieces,
            (SELECT e.reference FROM gestion_affectation a JOIN gestion_evenement e ON e.id = a.evenement_id
              WHERE a.fil_id = p.fil_id AND a.actif AND a.message_id IS NULL LIMIT 1) AS reference,
            (f.etat = 'sans_suite') AS sans_suite,
            ${montreLaCorbeille
              ? `(SELECT count(*) FROM gestion_message cc
                   WHERE cc.fil_id = p.fil_id AND cc.corbeille_le IS NOT NULL)::int`
              : '0'} AS nb_corbeille,
            cl.n AS cl_n, cl.humain AS cl_humain, cl.detail AS cl_detail,
            ${horsGestion ? 'hg.motif IS NOT NULL AS hg_marque, hg.motif AS hg_motif' : 'NULL::boolean AS hg_marque, NULL::text AS hg_motif'},
            ${sqlColonneInterne(interne)}
       FROM page p JOIN gestion_fil f ON f.id = p.fil_id
       ${jointureClassement}
       ${jointureHorsGestion}
       ${jointureInterne}
       -- La jointure latérale sert encore : aux autres étiquettes (où le message de la ligne peut être un envoi
       --   comme une réception) pour trouver le correspondant, et à Envoyés pour retrouver le NOM du destinataire.
       --   Elle ne sert plus à Réception, où le message de la ligne EST le dernier reçu : rien à chercher.
       --   (Aucun accent GRAVE ici : ce commentaire vit DANS un littéral gabarit, qu'un seul accent grave
       --    terminerait — piège consigné trois fois dans ce dépôt, dont une fois dans ce fichier même.)
       ${sens === 'recu' && rangAdresseGestion === null ? '' : SQL_INTERLOCUTEUR}
      ORDER BY p.recu_le DESC, p.fil_id DESC`;
}

/**
 * ══ 🔴🔴 LOT LISTE-PAGINATION — COMBIEN D'ÉCHANGES CETTE LISTE CONTIENT ═════════════════════════════════════════
 *
 * Le MÊME prédicat que la page (`predicatsBoite`), sans curseur, sans tri, sans `LIMIT`, et sans une seule des
 * colonnes d'affichage : ni l'interlocuteur, ni les sous-requêtes de comptage, ni les jointures de classement. On
 * ne demande pas QUI sont les lignes, seulement COMBIEN il y en a.
 *
 * 🔴 CE QUE ÇA RÉPARE. La pagination annonce « 1–25 sur N » au-dessus des lignes. Un N calculé « autrement mais
 * équivalent » — ou pire, un nombre de MESSAGES là où la liste montre des ÉCHANGES — rend la dernière page vide
 * ou inatteignable, et c'est toujours le compteur qu'on croit. Le défaut signalé par Arno était exactement de
 * cette famille : « 1–25 sur 291 354 », un ordre de grandeur qui n'est celui d'aucune liste d'échanges (la base
 * en porte 36 580 au 30/09/2026, pour 57 281 messages).
 *
 * ⚠️ LE `NOT EXISTS` EST CE QUI COMPTE DES ÉCHANGES ET NON DES MESSAGES. Il ne garde qu'un message par échange —
 * le dernier de sa boîte — donc la ligne et l'unité comptée sont la même chose, par construction. C'est la règle
 * déjà écrite dans `compterBoite`, appliquée ici à n'importe quelle étiquette et à n'importe quel filtre.
 *
 * 🔒 AUCUNE ÉCRITURE : un `SELECT count(*)`, comme tout ce fichier.
 *
 * Paramètres liés, dans cet ordre : ceux de l'étiquette (le cas échéant), puis notre adresse, puis les fils
 * retenus — la même suite que la page, moins les trois premiers (curseur, curseur, `LIMIT`) qu'un compte n'a pas.
 */
export function sqlCompteBoite(
  inclureAutomatiques: boolean, etiquette: Etiquette = ETIQUETTE_TOUT, corbeille = false, spam = false,
  rangFilsRetenus: number | null = null, etoilesSeules = false,
  rangAdresseGestion: number | null = null, etoileGmail = false,
  /** Le rang du paramètre de l'étiquette. 1 ici, contre 4 dans la page : un compte n'a ni curseur ni `LIMIT`. */
  rangEtiquette = 1,
): string {
  const {
    filtreM, filtreM2, filtreEtiquette, filtreSensM, filtreSensM2,
    filtreCorbeille, filtreCorbeilleM2, filtreSpamM, filtreSpamM2, filtreRetenus, filtreEtoile,
  } = predicatsBoite(inclureAutomatiques, etiquette, corbeille, spam, rangFilsRetenus, etoilesSeules,
    rangAdresseGestion, etoileGmail, rangEtiquette);
  return `SELECT count(*)::int AS n
       FROM gestion_message m
      WHERE true
        ${filtreM}
        ${filtreSensM}
        ${filtreEtiquette}
        ${filtreCorbeille}
        ${filtreSpamM}
        ${filtreRetenus}
        ${filtreEtoile}
        AND NOT EXISTS (
              SELECT 1 FROM gestion_message m2
               WHERE m2.fil_id = m.fil_id ${filtreM2} ${filtreSensM2} ${filtreSpamM2} ${filtreCorbeilleM2}
                 AND (m2.recu_le, m2.id) > (m.recu_le, m.id))`;
}

/**
 * 🔴 CE QUE LA BOÎTE MONTRE PAR DÉFAUT, ET POURQUOI CE N'EST PAS « TOUT ».
 *
 * MESURÉ sur la vraie base : **12 262 échanges sur 17 206 (71 %) ne contiennent QUE des messages écartés** par une
 * règle — presque tous des envois produits par un logiciel. Les verser dans la liste par défaut la remplirait à 71 %
 * de bruit, et le mode « boîte mail » serait illisible le jour de sa livraison.
 *
 * On ne les SUPPRIME pas pour autant, et on ne les cache pas en silence : `inclureAutomatiques` les ramène, l'écran
 * annonce leur nombre en toutes lettres, et l'interrupteur est visible en permanence. C'est le traitement que Gmail
 * réserve aux promotions : tout est là, rien ne noie le reste, et tout est à un geste.
 */
export interface OptionsBoite {
  /** Ramener aussi les échanges dont TOUS les messages sont tenus hors de la file par une règle. */
  inclureAutomatiques?: boolean;
  /** LOT 5-FUSION — l'étiquette choisie dans la colonne de gauche. Absente = « Réception », la boîte entière. */
  etiquette?: Etiquette;
  /** La fenêtre d'activité, en jours — utilisée par la seule étiquette « À classer ». Lue en base par l'appelant. */
  fenetreJours?: number;
  /**
   * ══ LOT ERGO-BOITE-3 — NE GARDER QUE CES ÉCHANGES-LÀ ══════════════════════════════════════════════════════════
   * La liste des échanges NON LUS, quand le sélecteur de « Réception » le demande. `undefined` = aucun filtre, et
   * la requête est alors mot pour mot celle d'avant ce lot.
   *
   * 🔴 POURQUOI UNE LISTE D'IDENTIFIANTS ET NON UNE CONDITION SQL. Le lu/non lu ne vit PAS dans notre base : il vit
   * chez Gmail, et c'est un choix d'Arno (lot 5-BOITE-2) — un seul état, commun à l'équipe, pour se répartir le
   * courrier sans doublon. La base ne peut donc pas le calculer ; c'est la route qui l'obtient de Gmail, puis le
   * passe ici. Une liste VIDE veut dire « aucun non lu » et rend une liste vide : c'est la vérité, pas une panne.
   */
  filsRetenus?: readonly number[];
  /**
   * LOT FILTRE-ETOILE — ne garder que les échanges portant l'étoile de l'équipe. Absent/`false` = tous, et la
   * requête est alors mot pour mot celle d'avant ce lot. Sans la migration 264, la table n'est nommée nulle part
   * et le filtre ne peut pas être demandé (l'écran n'affiche même pas le bouton).
   */
  etoilesSeules?: boolean;
}

/**
 * UNE PAGE DE LA BOÎTE, du message le plus récent au plus ancien.
 *
 * `total` n'est compté qu'à la PREMIÈRE page : c'est la seule requête un peu chère de l'écran, et la redemander à
 * chaque « voir plus » la paierait pour rien — le total ne bouge pas entre deux pages.
 */
export async function lireBoiteMail(
  curseur: CurseurBoite | null,
  partenaires: readonly PartenaireInterne[] = [],
  limite = PAGE_BOITE,
  options: OptionsBoite = {},
): Promise<PageBoite> {
  const etiquette = options.etiquette ?? ETIQUETTE_TOUT;
  // L'étiquette prime sur l'interrupteur quand elle ne laisse pas le choix — sans quoi « Courrier automatique »
  //   afficherait une liste vide, et « À classer » ne serait plus le poste de tri.
  const impose = autoImposeParEtiquette(etiquette);
  const tous = impose ?? options.inclureAutomatiques === true;
  // On demande UNE ligne de plus que la page : sa présence dit « il y a une suite », sans compter quoi que ce soit.
  const aLire = Math.min(Math.max(1, limite), 100) + 1;

  // LOT BOITE-INTERNE-CORBEILLE — la corbeille n'entre dans le SQL que si la migration 275 est là. Sonde HORS
  //   transaction : une colonne nommée alors qu'elle n'existe pas ferait échouer TOUTE la boîte, pas seulement la
  //   fonction nouvelle.
  const corbeille = await corbeilleGmailDisponible();
  // LOT ERGO-BOITE-3 — même règle pour le spam et pour la même raison : sans la migration 263, la colonne n'est
  //   nommée nulle part. Les deux sondes sont posées ENSEMBLE, en parallèle : elles sont mémoïsées et ne coûtent
  //   qu'au premier appel.
  const spam = await spamDisponible();
  // LOT CAPSULE-STATUT — même patron que les autres sondes : mémoïsée, posée hors transaction.
  const rattachements = await rattachementsDisponibles();
  // LOT STATUT-HORS-GESTION — même patron, même raison : sans la 266, la table n'est nommée nulle part.
  const horsGestion = await horsGestionDisponible();
  // LOT ETOILE-ET-SIGNATURE — même patron : sans la 277, la colonne `etoile_le` n'est nommée nulle part.
  const etoileGmail = await etoileGmailDisponible();
  // 🔴 LOT RATTACHER-EN-ECRIVANT — même patron : sans la 281, la table n'est nommée nulle part.
  const interne = await interneDisponible();
  // LOT ERGO-BOITE-3 — les fils retenus arrivent APRÈS les paramètres de l'étiquette : leur rang dépend donc de
  //   l'étiquette ouverte, et il est calculé ici plutôt que deviné. Poser un paramètre puis calculer son rang à
  //   partir de `params.length` est le décalage d'un cran qui s'est déjà produit dans ce dépôt.
  const paramsEtiquette = parametresEtiquette(etiquette, options.fenetreJours ?? 30);
  /**
   * LOT BOITE-INTERNE-CORBEILLE — NOTRE ADRESSE, et seulement là où elle sert (« Réception »). PostgreSQL REFUSE
   * une requête à qui l'on passe un paramètre qu'elle n'utilise pas : le rang est donc calculé, jamais deviné —
   * poser un paramètre puis déduire son rang de `params.length` est le décalage d'un cran qui s'est déjà produit
   * dans ce dépôt.
   */
  const adresseGestion = sensDeLEtiquette(etiquette) === 'recu' ? await adresseDeLaGestion() : null;
  const rangAdresse = adresseGestion === null ? null : 4 + paramsEtiquette.length;
  const retenus = options.filsRetenus;
  const rangRetenus = retenus === undefined
    ? null : 4 + paramsEtiquette.length + (rangAdresse === null ? 0 : 1);
  const { rows } = await query<LigneDB>(
    sqlPageBoite(tous, etiquette, corbeille, spam, rangRetenus, options.etoilesSeules === true, rattachements,
      horsGestion, rangAdresse, etoileGmail, interne),
    // `infinity` plutôt qu'une date arbitraire : il n'existe aucun message après, quelle que soit l'horloge.
    [curseur?.dernierLe ?? 'infinity', curseur?.filId ?? '9223372036854775807', aLire,
      ...paramsEtiquette, ...(adresseGestion === null ? [] : [adresseGestion]),
      ...(retenus === undefined ? [] : [[...retenus]])],
  );

  /**
   * ══ 🔴🔴 LOT LISTE-PAGINATION — LE NOMBRE D'ÉCHANGES DE **CETTE** LISTE ══════════════════════════════════════
   *
   * Demande d'Arno : « N = le nombre d'ÉCHANGES de la liste affichée ». Il est donc compté avec le prédicat de la
   * liste affichée, étiquette et filtres compris — pas avec celui d'une autre.
   *
   * ⚠️ À LA PREMIÈRE PAGE SEULEMENT. C'est la seule requête un peu chère de l'écran, et le nombre ne bouge pas
   * entre deux pages : le redemander à chaque `‹ ›` le paierait pour rien.
   *
   * 🔴 ET LES RANGS DES PARAMÈTRES REPARTENT DE 1 : le compte n'a ni curseur ni `LIMIT`, donc pas de `$1..$3`.
   * PostgreSQL refuse une requête à qui l'on fournit un paramètre qu'elle n'utilise pas — c'est le piège déjà
   * consigné deux fois dans ce fichier, et la raison pour laquelle chaque rang est CALCULÉ, jamais deviné.
   */
  const rangAdresseCompte = adresseGestion === null ? null : 1 + paramsEtiquette.length;
  const rangRetenusCompte = retenus === undefined
    ? null : 1 + paramsEtiquette.length + (rangAdresseCompte === null ? 0 : 1);
  const compteDeLaListe = curseur !== null ? null : (await query<{ n: number }>(
    sqlCompteBoite(tous, etiquette, corbeille, spam, rangRetenusCompte, options.etoilesSeules === true,
      rangAdresseCompte, etoileGmail, 1),
    [...paramsEtiquette, ...(adresseGestion === null ? [] : [adresseGestion]),
      ...(retenus === undefined ? [] : [[...retenus]])],
  )).rows[0]?.n ?? 0;

  const aSuite = rows.length === aLire;
  const gardees = aSuite ? rows.slice(0, aLire - 1) : rows;
  const dernier = gardees[gardees.length - 1];

  /**
   * LOT ENVOI-DIAG — LES AVIS DE NON-REMISE DES ÉCHANGES DE CETTE PAGE, en UNE requête.
   *
   * ⚠️ APRÈS le découpage, jamais avant : demander les avis des trente-et-une lignes lues pour n'en afficher trente
   * serait payer une ligne pour rien à chaque page. Et une seule requête pour les trente : une par ligne ferait
   * trente allers-retours pour découvrir, presque toujours, que rien n'a été refusé.
   */
  const filsDeLaPage = gardees.map((r) => Number(r.fil_id));
  /**
   * LOT LISTE-GMAIL — les étoiles de la page, en UNE requête, comme les avis de non-remise juste à côté. Une
   * requête par ligne se verrait à l'écran ; sans la migration 264, `etoilesDesFils` rend un ensemble vide sans
   * rien demander à la base.
   */
  /**
   * 🔴 LOT LIGNE-NON-ENVOYE — les mails qui ne sont PAS partis.
   *
   * Deux lectures, et elles ne répondent pas à la même question :
   *   · `nonEnvoyesDesFils` — « un échange de cette page a-t-il un envoi en échec ? » → la capsule se POSE sur sa
   *     ligne, qui existe déjà. C'est le cas courant : une réponse qui ne part pas ;
   *   · `nonEnvoyesAMontrer` — « y a-t-il des échecs SANS échange, ou dont l'échange n'est pas sur cette page ? »
   *     → il leur faut une ligne à eux, sinon un message neuf qui ne part pas n'apparaît NULLE PART.
   *
   * ⚠️ LA SECONDE N'EST DEMANDÉE QUE SOUS « ENVOYÉS », ET QU'À LA PREMIÈRE PAGE. Ailleurs elle n'aurait pas de
   * sens (un mail non parti n'est pas du courrier reçu) ; et insérer des lignes au milieu d'une pagination par
   * curseur ferait sauter des échanges d'une page à l'autre.
   */
  const premierePage = curseur === null;
  const montrerEchecs = etiquette.sorte === 'envoyes' && premierePage;
  const [avis, etoiles, echecsDesFils, echecsOrphelins, piecesDesFils] = await Promise.all([
    nonRemisesDesFils(filsDeLaPage),
    etoileGmail ? filsEtoiles(filsDeLaPage) : etoilesDesFils(filsDeLaPage),
    nonEnvoyesDesFils(filsDeLaPage),
    montrerEchecs ? nonEnvoyesAMontrer() : Promise.resolve([] as MentionNonEnvoye[]),
    piecesVraiesDesFils(filsDeLaPage),
  ]);

  const lignes: LigneBoite[] = gardees.map((r) => ({
      // ⚠️ `pg` rend les `bigint` en CHAÎNE : sans cette conversion, l'écran comparerait des chaînes à des nombres et
      //    les clés React comme les comparaisons d'identifiant mentiraient. Piège connu du dépôt.
      filId: Number(r.fil_id),
      messageAffiche: Number(r.message_id),
      objet: r.objet,
      // Le libellé d'un partenaire interne PRIME sur le nom porté par le mail, ici comme partout dans le module.
      interlocuteur: r.interlocuteur_adresse === null
        ? r.interlocuteur
        : libelleExpediteur(partenaires, r.interlocuteur_adresse, r.interlocuteur) || r.interlocuteur,
      dernierSens: r.dernier_sens === 'envoye' ? ('envoye' as const) : ('recu' as const),
      dernierLe: r.dernier_le,
      extrait: r.extrait && r.extrait.trim() !== '' ? r.extrait : null,
      nbMessages: r.nb_messages,
      nbLisibles: r.nb_lisibles,
      aPiece: r.nb_pieces > 0,
      nbPieces: r.nb_pieces,
      /**
       * LOT LECTURE-HTML-FIL-TROMBONE — les deux nombres du trombone. Ils sortent d'UNE lecture supplémentaire
       * pour toute la page (`piecesVraiesDesFils`), pas d'une requête par ligne.
       */
      piecesDuMessage: piecesDesFils.get(Number(r.fil_id))?.get(Number(r.message_id))?.length ?? 0,
      piecesAilleurs: [...(piecesDesFils.get(Number(r.fil_id)) ?? new Map()).entries()]
        .filter(([msg]) => msg !== Number(r.message_id))
        .reduce((n, [, liste]) => n + liste.length, 0),
      nbCorbeille: r.nb_corbeille,
      reference: r.reference,
      sansSuite: r.sans_suite === true,
      nonRemise: avis.get(Number(r.fil_id)) ?? null,
      // 🔴 LA CAPSULE « Non envoyé », sur la ligne de l'échange concerné. `null` = rien à signaler.
      nonEnvoye: echecsDesFils.get(Number(r.fil_id)) ?? null,
      etoilee: etoiles.has(Number(r.fil_id)),
      classement: r.cl_n === null && r.cl_humain === null && r.cl_detail === null
        ? null
        : { nbActifs: r.cl_n ?? 0, parUnHumain: r.cl_humain === true, detail: r.cl_detail },
      // LOT STATUT-HORS-GESTION — `false` quand la migration 266 manque : aucune capsule grise, jamais par défaut.
      horsGestion: r.hg_marque === true,
      motifHorsGestion: r.hg_motif,
      // 🔴 LOT RATTACHER-EN-ECRIVANT — la marque de l'ÉCHANGE. `false` sans la 281 : jamais un état inventé.
      interne: r.itn_marque === true,
  }));

  return {
    /**
     * 🔴 LOT LIGNE-NON-ENVOYE — LES ÉCHECS SANS LIGNE OBTIENNENT LA LEUR, À LEUR PLACE CHRONOLOGIQUE.
     *
     * La règle de fusion vit dans le module PUR (`fusionnerNonEnvoyes`), où elle est éprouvée entièrement : un
     * échange déjà présent reçoit la MENTION et jamais une seconde ligne ; un message neuf, qui n'a pas d'échange,
     * obtient une ligne à lui. Ici, on ne fait que fournir de quoi fabriquer cette ligne.
     *
     * ⚠️ `filId` NÉGATIF pour une ligne fabriquée : elle ne désigne AUCUN échange, et un `0` ou un identifiant
     * inventé enverrait le clic ouvrir une conversation qui n'existe pas. Le signe rend l'absence lisible partout,
     * y compris dans une clé React.
     */
    lignes: fusionnerNonEnvoyes(lignes, echecsOrphelins, (e) => ({
      filId: -e.fileId,
      messageAffiche: 0,
      objet: e.objet,
      interlocuteur: e.destinataires[0] ?? null,
      dernierSens: 'envoye' as const,
      dernierLe: e.demandeLe,
      extrait: e.cause,
      nbMessages: 1,
      nbLisibles: 1,
      aPiece: false,
      nbPieces: 0,
      piecesDuMessage: 0,
      piecesAilleurs: 0,
      nbCorbeille: 0,
      reference: null,
      sansSuite: false,
      nonRemise: null,
      nonEnvoye: e,
      etoilee: false,
      classement: null,
      horsGestion: false,
      motifHorsGestion: null,
      interne: false,
    })),
    suivant: aSuite && dernier ? { dernierLe: dernier.dernier_le, filId: dernier.fil_id } : null,
    /**
     * ══ 🔴 LOT LISTE-PAGINATION — LE TOTAL EST CELUI DE **CETTE** LISTE, SOUS TOUTE ÉTIQUETTE ════════════════
     *
     * CE QUI ÉTAIT ÉCRIT ICI, ET QUI NE VAUT PLUS : « le total n'est compté QUE pour la boîte entière ; sous une
     * étiquette, c'est la colonne de gauche qui porte le nombre — et le recompter ici donnerait deux chiffres
     * pour une seule vérité ». La crainte était juste, mais elle visait un compte écrit AUTREMENT. Ce compte-ci
     * est écrit avec LE MÊME PRÉDICAT que la liste (`predicatsBoite`), ce qui est exactement l'inverse : il ne
     * peut pas diverger de ce qu'on voit, puisque c'est la même phrase.
     *
     * 🔴 ET IL LE FALLAIT. La pagination « 1–25 sur N · ‹ › » existe sous TOUTES les étiquettes, avec ou sans
     * filtre étoilé. Sans total sous « Spam » ou « Corbeille », elle n'aurait pas su dire combien de pages il y
     * a ; avec le total de la colonne de gauche — qui ignore le filtre étoilé —, elle aurait annoncé 8 546
     * au-dessus de deux lignes, ce qui est le défaut déjà corrigé une fois dans le titre.
     *
     * ⚠️ `null` GARDE SON SENS EXACT : « pas la première page », donc « on ne l'a pas recompté ». Jamais zéro.
     */
    total: compteDeLaListe,
  };
}

/**
 * ══ 🔴 LES VRAIES PIÈCES JOINTES DES ÉCHANGES D'UNE PAGE, rangées par message ══════════════════════════════════
 *
 * UNE SEULE REQUÊTE pour toute la page, jamais une par ligne. Mesuré le 29/09/2026 : 3,9 pièces par échange en
 * moyenne (26 970 pièces sur 6 980 échanges), soit environ 120 lignes pour une page de 30 — et 268 au pire cas.
 *
 * 🔴 LE TRI EST FAIT EN TypeScript, PAR `trierPieces`, ET C'EST TOUT L'INTÉRÊT. C'est la MÊME fonction que la
 * conversation emploie pour séparer les vraies pièces des images de signature. Réécrire cette règle en SQL — « un
 * nom qui commence par image, ou moins de 10 ko » — aurait donné deux définitions de « pièce jointe » : la liste
 * aurait compté 2, le message ouvert en aurait montré 1, et l'on aurait cherché longtemps laquelle a raison.
 *
 * ⚠️ LES FICHIERS « ._ » SONT ÉCARTÉS ICI, en SQL, parce que ce n'est pas la même règle : ce ne sont pas des
 * pièces mal rangées, ce sont les doubles que macOS ajoute à côté de chaque fichier. Aucun n'existe aujourd'hui en
 * base (mesuré : 0), et c'est justement pour cela qu'on l'écrit maintenant — le jour où il y en aura, personne
 * n'y repensera.
 */
export async function piecesVraiesDesFils(
  filIds: readonly number[],
): Promise<Map<number, Map<number, PieceATrier[]>>> {
  const parFil = new Map<number, Map<number, PieceATrier[]>>();
  if (filIds.length === 0) return parFil;
  const { rows } = await query<{
    fil_id: string; message_id: string; nom_fichier: string; type_mime: string | null;
    taille_octets: string | null;
  }>(
    `SELECT m.fil_id::text, p.message_id::text, ${await sqlNomAffiche('p')} AS nom_fichier,
            p.type_mime, p.taille_octets::text
       FROM gestion_piece p
       JOIN gestion_message m ON m.id = p.message_id
      WHERE m.fil_id = ANY($1::bigint[])
        AND p.nom_fichier NOT LIKE '._%'
      ORDER BY p.id`, [[...filIds]]);
  for (const r of rows) {
    const fil = Number(r.fil_id);
    const message = Number(r.message_id);
    const piece: PieceATrier = {
      nomFichier: r.nom_fichier,
      typeMime: r.type_mime,
      // ⚠️ `bigint` en CHAÎNE avec pg : sans conversion, la comparaison de taille de `trierPieces` serait textuelle.
      tailleOctets: r.taille_octets === null ? null : Number(r.taille_octets),
    };
    // 🔴 LA MÊME RÈGLE QUE L'ÉCRAN D'UN MESSAGE : on ne garde que ce que `trierPieces` appelle une VRAIE pièce.
    if (trierPieces([piece]).vraies.length === 0) continue;
    const parMessage = parFil.get(fil) ?? new Map<number, PieceATrier[]>();
    parMessage.set(message, [...(parMessage.get(message) ?? []), piece]);
    parFil.set(fil, parMessage);
  }
  return parFil;
}

/**
 * Combien d'échanges la boîte contient au total. Un échange compte dès qu'il porte AU MOINS un message non écarté —
 * même règle que la liste, pour que le compteur et la liste ne racontent jamais deux histoires différentes.
 */
export async function compterBoite(
  inclureAutomatiques = false, sens: 'recu' | 'envoye' = 'recu', corbeille = false, spam = false,
  /** LOT FILTRE-ETOILE — le compteur compte EXACTEMENT ce que la liste montre, filtre compris. */
  etoilesSeules = false,
): Promise<number> {
  /**
   * LOT BOITE-SENS — CE TOTAL EST LA LISTE, SANS LE CURSEUR NI LE `LIMIT`.
   *
   * 🔴 IL EST ÉCRIT AVEC LE MÊME PRÉDICAT, EXPRÈS. Un compteur calculé « autrement mais équivalent » annonce tôt ou
   * tard un nombre que la liste ne montre pas — et c'est toujours le compteur qu'on croit. Compter les messages qui
   * sont le DERNIER DE LEUR SENS dans leur échange, c'est compter exactement une ligne par échange qui en contient
   * au moins un : la nouvelle règle, sans la réénoncer.
   *
   * ⚠️ AVANT CE LOT c'était un `DISTINCT ON (fil_id)` qui ne gardait que le dernier message de l'échange, tous sens
   * confondus : la forme même de l'exclusivité. Elle ne convient plus, et la garder « parce qu'elle marchait »
   * aurait donné deux boîtes dont les totaux ne sont pas ceux des listes.
   */
  // LOT BOITE-INTERNE-CORBEILLE — la corbeille est écartée des deux totaux, AUX DEUX ÉTAGES comme dans la liste.
  const horsCorbeille = corbeille ? 'AND m.corbeille_le IS NULL' : '';
  const horsCorbeilleM2 = corbeille ? 'AND m2.corbeille_le IS NULL' : '';
  // LOT ERGO-BOITE-3 — le spam n'entre dans AUCUN de ces deux totaux, aux deux étages : le compteur doit compter
  //   exactement ce que la liste montre, et la liste l'écarte (cf. `sqlPageBoite`).
  const horsSpamM = spam ? 'AND m.spam_le IS NULL' : '';
  const seulementEtoiles = etoilesSeules ? `AND ${sqlEtoile(await etoileGmailDisponible())}` : '';
  const horsSpamM2 = spam ? 'AND m2.spam_le IS NULL' : '';
  /**
   * LOT BOITE-INTERNE-CORBEILLE — LE MÊME PRÉDICAT D'APPARTENANCE QUE LA LISTE, aux deux étages.
   *
   * ⚠️ LE `m2` NE PEUT PLUS S'ÉCRIRE `m2.sens = m.sens`. Cette forme-là disait « du même sens que le candidat »,
   * ce qui n'a plus de sens depuis qu'un envoi qui nous est adressé appartient à la Réception : un message REÇU y
   * serait comparé aux seuls reçus, et un envoi-à-nous-mêmes aux seuls envois — deux règles dans une requête.
   * L'appartenance, elle, est la même pour les deux, et c'est elle qu'on écrit.
   */
  // ⚠️ SOUS « ENVOYÉS », LE PRÉDICAT EST UN LITTÉRAL ET N'UTILISE AUCUN PARAMÈTRE — on n'en passe donc aucun.
  //    PostgreSQL REFUSE une requête à qui l'on fournit plus de paramètres qu'elle n'en réclame (« bind message
  //    supplies 1 parameters, but prepared statement requires 0 ») : c'est le piège que `parametresEtiquette`
  //    évite déjà plus haut, et il se referme ici de la même manière.
  const rangAdresse = sens === 'recu' ? 1 : null;
  const appartenanceM = sqlAppartenance('m', sens, rangAdresse);
  const appartenanceM2 = sqlAppartenance('m2', sens, rangAdresse);
  const { rows } = await query<{ n: number }>(
    `SELECT count(*)::int AS n
       FROM gestion_message m
      WHERE ${appartenanceM}
        ${inclureAutomatiques ? '' : 'AND m.exclu_le IS NULL'}
        ${horsSpamM}
        ${seulementEtoiles}
        ${horsCorbeille}
        -- « aucun message plus récent de la MÊME BOÎTE dans cet échange » : exactement le prédicat de la liste.
        AND NOT EXISTS (
              SELECT 1 FROM gestion_message m2
               WHERE m2.fil_id = m.fil_id AND ${appartenanceM2}
                 ${inclureAutomatiques ? '' : 'AND m2.exclu_le IS NULL'}
                 ${horsSpamM2}
                 ${horsCorbeilleM2}
                 AND (m2.recu_le, m2.id) > (m.recu_le, m.id))`,
    // $1 = notre adresse, et UNIQUEMENT sous « Réception » : ailleurs la requête n'a pas de paramètre du tout.
    rangAdresse === null ? [] : [await adresseDeLaGestion()]);
  return rows[0]?.n ?? 0;
}

/**
 * Les DEUX comptes de la boîte, pour que l'écran puisse dire ce qu'il montre ET ce qu'il ne montre pas. Un outil qui
 * cache sans le dire ment ; un outil qui annonce ce qu'il tait reste honnête — c'est la règle du module depuis le lot 4b.
 */
export async function comptesBoite(): Promise<{
  lisibles: number; automatiques: number; envoyes: number; reception: number; spam: number;
  /**
   * LOT BOITE-INTERNE-CORBEILLE — combien de MESSAGES sont à la corbeille de Gmail. `null` = migration 275
   * absente : l'entrée « Corbeille » n'apparaît alors pas du tout, plutôt qu'un zéro qu'on n'a pas mesuré et qui
   * se lirait « la corbeille est vide ».
   */
  corbeille: number | null;
}> {
  /**
   * LOT BOITE-SENS — LES DEUX BOÎTES NE SONT PLUS DISJOINTES, ET LEUR SOMME NE VEUT PLUS RIEN DIRE.
   *
   * Un échange où l'on a reçu ET répondu compte dans les deux. `reception + envoyes` dépasse donc le nombre
   * d'échanges lisibles, et c'est normal : ce sont deux vues du même courrier, pas deux moitiés d'un tout. Rien
   * dans l'écran n'additionne ces deux nombres — et personne ne devrait s'y mettre.
   *
   * 🔴 LA CORBEILLE EST ÉCARTÉE ICI AUSSI, et par la MÊME règle que la liste : un message à la corbeille de Gmail
   * ne compte dans aucune des deux boîtes. Sans cela, la colonne de gauche et l'en-tête de la liste — qui sort de
   * `compterBoite` — annonceraient deux nombres différents pour la même boîte, et c'est celui de gauche qu'on
   * lit. Sans la migration 275, la colonne n'est pas nommée et le comportement est celui d'avant.
   *
   * ⚠️ UN SEUL parcours pour les quatre nombres : quatre `FILTER` sur le regroupement qui existait déjà. Même
   * balayage, même coût, et aucune chance que les compteurs se contredisent puisqu'ils sortent d'une seule lecture.
   */
  const [corbeille, spam] = await Promise.all([corbeilleGmailDisponible(), spamDisponible()]);
  /**
   * LOT ERGO-BOITE-3 — LE CINQUIÈME NOMBRE, ET L'EXCLUSION DES QUATRE AUTRES.
   *
   * 🔴 LE SPAM SE COMPTE EN MESSAGES, PAS EN ÉCHANGES, et c'est délibéré. Un spam n'ouvre pas de conversation : le
   * regrouper par échange donnerait un nombre plus petit que ce que la liste montre, pour une raison que personne
   * n'aurait envie de comprendre. La liste « Spam » affiche un spam par ligne ; le compteur en dit autant.
   *
   * ⚠️ Sans la migration 263, la colonne n'est nommée nulle part : `0` est alors la vérité — rien n'a été relevé.
   */
  /**
   * 🔴 L'EXPRESSION ENTIÈRE, PAS SEULEMENT L'AGRÉGAT — défaut vu à l'écran le 27/09/2026, et il faut le raconter.
   * Première version : `(SELECT ${compteSpam} FROM gestion_message)` avec `compteSpam` valant `'0'` sans la
   * migration. Cela donnait `(SELECT 0 FROM gestion_message)` — une sous-requête SCALAIRE qui rend 56 821 lignes.
   * PostgreSQL répond « more than one row returned by a subquery used as an expression », la route rend 503, et
   * TOUS les compteurs de la colonne disparaissent — pas seulement celui du spam. Les tests unitaires ne l'ont pas
   * vu : ils vérifiaient qu'aucune colonne absente n'était nommée, ce qui était vrai. Seul l'écran l'a montré.
   * La règle qui en sort : quand une sonde peut faire disparaître le `FROM`, c'est l'EXPRESSION COMPLÈTE qu'on
   * choisit, jamais un morceau qu'on emboîte ensuite.
   */
  /**
   * ══ 🔴🔴 LOT LISTE-PAGINATION — LE SPAM SE COMPTE EN ÉCHANGES, COMME LA CORBEILLE. MESURÉ ═══════════════════
   *
   * CE QUI ÉTAIT ÉCRIT ICI, ET QUI ÉTAIT FAUX :
   *     '(SELECT count(*) FILTER (WHERE spam_le IS NOT NULL)::int FROM gestion_message)'
   * avec pour justification « le spam se compte en messages parce qu'un spam n'ouvre pas de conversation — sa
   * liste EST une liste de spams ».
   *
   * 🔴 LA LISTE N'EST PAS UNE LISTE DE SPAMS : c'est une liste d'ÉCHANGES, comme toutes les autres. Le prédicat
   * `NOT EXISTS` de `sqlPageBoite` ne garde qu'un message par échange, sous l'étiquette « Spam » comme sous les
   * six autres — rien n'y fait exception. La justification décrivait une liste qui n'existe pas.
   *
   * MESURÉ EN BASE LE 30/09/2026 : 261 messages marqués spam, répartis sur 258 échanges. La colonne annonçait
   * donc 261 au-dessus de 258 lignes. Écart invisible tant que rien ne s'appuyait dessus ; avec la pagination,
   * il devient « 1–25 sur 261 » pour 258 échanges, et la dernière page serait à moitié vide.
   *
   * ⚠️ C'EST LA MÊME FAMILLE D'ERREUR QUE CELLE QU'ARNO A SIGNALÉE (« 1–25 sur 291 354 ») : un nombre de MESSAGES
   * là où la liste montre des ÉCHANGES. On la corrige des deux côtés à la fois.
   */
  const compteSpam = spam
    ? '(SELECT count(DISTINCT fil_id)::int FROM gestion_message WHERE spam_le IS NOT NULL)'
    : '0::int';
  /**
   * LOT BOITE-INTERNE-CORBEILLE — LE SIXIÈME NOMBRE, écrit sur le MÊME patron que le spam (et sujet au MÊME piège
   * de la sous-requête scalaire raconté juste au-dessus : c'est l'EXPRESSION ENTIÈRE qui est choisie, jamais un
   * morceau qu'on emboîte).
   *
   * 🔴 LA CORBEILLE SE COMPTE EN MESSAGES, PAS EN ÉCHANGES, comme le spam et pour la même raison : c'est un
   * message que Gmail met à la corbeille, pas une conversation. La liste en affiche un par ligne ; le compteur en
   * dit autant. Et `NULL` sans la migration, pour que l'entrée disparaisse au lieu d'annoncer « 0 ».
   */
  /**
   * 🔴 ELLE SE COMPTE EN ÉCHANGES, PAS EN MESSAGES. La LISTE « Corbeille » rend une ligne par ÉCHANGE (le dernier
   * mail supprimé y représente les autres, cf. `sqlPageBoite`) : compter les messages annoncerait un nombre que la
   * liste ne montre pas, et c'est toujours le compteur qu'on croit. Mesuré le 30/09/2026 : 19 messages à la
   * corbeille pour 17 échanges.
   *
   * ⚠️ LOT LISTE-PAGINATION — LE SPAM JUSTE AU-DESSUS SUIT DÉSORMAIS LA MÊME RÈGLE. Le commentaire d'ici
   * annonçait « deux règles différentes, parce que les deux listes sont différentes » : c'était faux, les deux
   * listes sont des listes d'échanges. Il n'y a plus qu'une règle, et c'est celle-ci.
   */
  const compteCorbeille = corbeille
    ? '(SELECT count(DISTINCT fil_id)::int FROM gestion_message WHERE corbeille_le IS NOT NULL)'
    : 'NULL::int';
  // Le spam ET la corbeille sortent des quatre autres nombres, à la source du regroupement.
  const exclusions = [spam ? 'spam_le IS NULL' : '', corbeille ? 'corbeille_le IS NULL' : '']
    .filter((x) => x !== '');
  const horsSpam = exclusions.length === 0 ? '' : `WHERE ${exclusions.join(' AND ')}`;
  /**
   * ══ 🔴 LOT BOITE-INTERNE-CORBEILLE — « DERNIER REÇU » DEVIENT « DERNIER DE LA RÉCEPTION » ════════════════════
   * Un message que nous nous sommes adressé est dans notre Réception (règle de Gmail) : il doit donc compter ici
   * comme il compte dans la liste. Sans cette ligne, la colonne de gauche annoncerait un nombre et l'en-tête de la
   * liste — qui sort de `compterBoite` — en annoncerait un autre, avec 32 échanges d'écart. C'est exactement la
   * divergence que le lot BOITE-SENS avait payée une fois.
   *
   * ⚠️ « Envoyés » N'EST PAS TOUCHÉ : ces messages y restent, et ils y étaient déjà.
   */
  const dansLaReception = `(sens = 'recu' OR ${sqlNousEstAdresse('gestion_message', 1)})`;
  const { rows } = await query<{
    lisibles: number; total: number; envoyes: number; reception: number; spam: number; corbeille: number | null;
  }>(
    `SELECT ${compteSpam} AS spam,
            ${compteCorbeille} AS corbeille,
            count(*) FILTER (WHERE lisibles > 0)::int AS lisibles,
            count(*)::int AS total,
            count(*) FILTER (WHERE dernier_envoye IS NOT NULL)::int AS envoyes,
            count(*) FILTER (WHERE dernier_recu IS NOT NULL)::int AS reception
       FROM (SELECT fil_id,
                    count(*) FILTER (WHERE exclu_le IS NULL) AS lisibles,
                    max(recu_le) FILTER (WHERE exclu_le IS NULL AND ${dansLaReception}) AS dernier_recu,
                    max(recu_le) FILTER (WHERE exclu_le IS NULL AND sens = 'envoye') AS dernier_envoye
               FROM gestion_message ${horsSpam} GROUP BY fil_id) x`,
    [await adresseDeLaGestion()]);
  const l = rows[0]?.lisibles ?? 0;
  return {
    lisibles: l, automatiques: (rows[0]?.total ?? 0) - l, envoyes: rows[0]?.envoyes ?? 0,
    reception: rows[0]?.reception ?? 0, spam: rows[0]?.spam ?? 0,
    // ⚠️ `null` VOYAGE TEL QUEL : il se lit « on ne sait pas » (migration absente), jamais « zéro ».
    corbeille: rows[0]?.corbeille ?? null,
  };
}
