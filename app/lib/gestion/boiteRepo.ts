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
import { fusionnerNonEnvoyes, type MentionNonEnvoye } from './fileEnvoi';
import { corbeilleDisponible, spamDisponible, rattachementsDisponibles, horsGestionDisponible } from './schema';
import { etoilesDesFils } from './etoileRepo';

/** Combien d'échanges par page. Assez pour remplir un écran de téléphone sans faire attendre. */
export const PAGE_BOITE = 30;

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
  reference: string | null;
  sans_suite: boolean;
  /** LOT CAPSULE-STATUT — rendus par la jointure latérale ; tous `null` quand la migration 257 est absente. */
  cl_n: number | null;
  cl_humain: boolean | null;
  cl_detail: string | null;
  /** LOT STATUT-HORS-GESTION — `null` quand la migration 266 manque : aucune capsule grise n'est alors rendue. */
  hg_marque: boolean | null;
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
 * LOT 5-BOITE-3 — L'ÉCHANGE EST-IL À LA CORBEILLE ? La règle, écrite UNE fois, et entièrement DÉRIVÉE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 « EN CORBEILLE » = le geste est POSTÉRIEUR OU ÉGAL au dernier message. Comme `m` EST le dernier message de son
 * échange (prédicat du CTE `page`), la comparaison se fait sur lui — et c'est ce qui donne gratuitement le
 * comportement de Gmail : UN NOUVEAU MESSAGE FAIT REVENIR L'ÉCHANGE dans sa boîte, tout seul, sans qu'une seule
 * ligne soit écrite nulle part. Pas de rattrapage à la relève, rien qui puisse se désynchroniser.
 *
 * ⚠️ `>=` ET NON `>` : deux messages peuvent porter le même instant à la seconde près, et un geste fait dans la même
 * seconde que l'arrivée d'un message doit tenir — sinon l'échange ressortirait aussitôt, sans explication.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
/**
 * LOT FILTRE-ETOILE — « cet échange porte l'étoile de l'équipe ». Écrit UNE fois, lu par la liste ET par le
 * compteur : un compteur qui compterait autrement finirait par annoncer un nombre que la liste ne montre pas.
 */
const SQL_ETOILE = `EXISTS (SELECT 1 FROM gestion_fil_etoile fe WHERE fe.fil_id = m.fil_id AND fe.etoilee)`;

const SQL_EN_CORBEILLE = `EXISTS (SELECT 1 FROM gestion_fil fc
                                   WHERE fc.id = m.fil_id AND fc.corbeille_le IS NOT NULL
                                     AND fc.corbeille_le >= m.recu_le)`;

/**
 * LOT ERGO-BOITE-3 — « CE MESSAGE EST DU SPAM ». Écrit UNE fois, lu partout : l'étiquette « Spam » en prend la forme
 * positive, toutes les autres sa négation. Deux écritures finiraient par se contredire et laisseraient un message
 * invisible partout — ou, pire, un spam en Réception.
 */
const SQL_EST_SPAM = 'm.spam_le IS NOT NULL';

function sqlEtiquette(e: Etiquette, corbeille: boolean, spam: boolean): string {
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
      return `AND m.recu_le >= now() - ($4::int * interval '1 day')
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
    // LOT 5-BOITE-3 — « Corbeille » : le seul endroit qui MONTRE ce que les autres écartent. Le filtre y est donc la
    //   forme POSITIVE exacte de l'exclusion posée sur toutes les autres étiquettes — écrites au même endroit, elles
    //   ne peuvent pas diverger et laisser un échange invisible partout.
    case 'corbeille':
      // ⚠️ SANS LA MIGRATION 251, ON NE NOMME PAS LA COLONNE — pas même ici. Quelqu'un peut arriver sur cette
      //   étiquette par une adresse enregistrée : nommer une colonne absente ferait échouer TOUTE la boîte, pas
      //   seulement cette liste. Le prédicat impossible rend une liste VIDE, comme pour « Brouillons ».
      return corbeille ? `AND ${SQL_EN_CORBEILLE}` : 'AND false';
    // Une CARTE : ses échanges rattachés. `message_id IS NULL` — une affectation de MAIL isolé n'est pas un échange
    //   rattaché, et la compter ici ferait apparaître dans l'étiquette un échange qui appartient à une autre carte.
    case 'carte':
      return `AND EXISTS (SELECT 1 FROM gestion_affectation a0
                            WHERE a0.fil_id = m.fil_id AND a0.actif AND a0.message_id IS NULL
                              AND a0.evenement_id = $4::bigint)`;
  }
}

/** Le paramètre `$4` que l'étiquette réclame — au plus un, jamais un de trop (voir l'encadré ci-dessus). */
export function parametresEtiquette(e: Etiquette, fenetreJours: number): number[] {
  if (e.sorte === 'a_classer') return [fenetreJours];
  if (e.sorte === 'carte') return [e.evenementId ?? 0];
  return [];
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
): string {
  // Le filtre s'applique AUX DEUX ÉTAGES du parcours (le message candidat, et le « y a-t-il plus récent ? ») : les
  //   dissocier ferait sortir un échange dont le dernier message est écarté, avec l'avant-dernier comme aperçu.
  const filtreM = inclureAutomatiques ? '' : 'AND m.exclu_le IS NULL';
  const filtreM2 = inclureAutomatiques ? '' : 'AND m2.exclu_le IS NULL';
  const filtreEtiquette = sqlEtiquette(etiquette, corbeille, spam);
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
  const filtreSensM = sens === null ? '' : `AND m.sens = '${sens}'`;
  const filtreSensM2 = sens === null ? '' : `AND m2.sens = '${sens}'`;
  /**
   * L'INTERLOCUTEUR SUIT LE MESSAGE AFFICHÉ, et il ne peut plus en être autrement.
   *
   * · Réception : `p` EST le dernier message reçu, donc son expéditeur EST l'interlocuteur. On le lit directement
   *   sur `p` — la jointure latérale qui allait le chercher n'a plus rien à chercher, et disparaît.
   * · Envoyés : `p` est le dernier message envoyé, donc l'autre partie est son DESTINATAIRE (« À : … »).
   * · Les autres étiquettes gardent la jointure latérale : là, `p` peut être un envoi comme une réception.
   */
  const colonnesInterlocuteur = sens === 'recu'
    ? `coalesce(nullif(btrim(p.de_nom), ''), p.de_adresse) AS interlocuteur,
            p.de_adresse AS interlocuteur_adresse,`
    : sens === 'envoye'
      /**
       * `dest_a -> 0` : la première adresse « À », pour que le libellé d'un partenaire interne s'applique aussi
       * dans Envoyés.
       *
       * ⚠️ ET LE NOM DE LA PERSONNE, PAS SEULEMENT SON ADRESSE. Nos propres envois écrivent `To: adresse` sans nom
       * — la ligne afficherait donc « a.jorel@sansvisavis.com » là où la Réception affiche « Arnaud », pour la même
       * personne et le même échange. On prend, dans l'ordre : le nom écrit dans « À » s'il y en a un ; sinon le nom
       * sous lequel CETTE personne nous a écrit DANS CET ÉCHANGE (c'est le cas d'une réponse, donc le cas courant) ;
       * sinon le texte brut des destinataires, qui porte tout le monde.
       */
      ? `coalesce(nullif(btrim(p.dest_a -> 0 ->> 'nom'), ''),
                   CASE WHEN i.de_adresse = (p.dest_a -> 0 ->> 'adresse')
                        THEN nullif(btrim(i.de_nom), '') END,
                   nullif(btrim(p.destinataires), '')) AS interlocuteur,
            (p.dest_a -> 0 ->> 'adresse') AS interlocuteur_adresse,`
      : `coalesce(nullif(btrim(i.de_nom), ''), i.de_adresse, nullif(btrim(p.destinataires), '')) AS interlocuteur,
            i.de_adresse AS interlocuteur_adresse,`;
  // LOT 5-BOITE-3 — TOUTES les autres étiquettes écartent la corbeille, et la corbeille seule la montre. Sans la
  //   migration 251, `corbeille` est faux : la colonne n'est PAS nommée — la nommer ferait échouer toute la boîte,
  //   pas seulement le geste nouveau.
  const filtreCorbeille = !corbeille || etiquette.sorte === 'corbeille' ? '' : `AND NOT ${SQL_EN_CORBEILLE}`;
  /**
   * ══ 🔴 LOT ERGO-BOITE-3 — LE SPAM NE SORT DE NULLE PART, SAUF DE SON ÉTIQUETTE ═══════════════════════════════
   * Il est écarté AUX DEUX ÉTAGES du parcours, comme le courrier automatique et pour la même raison : posé sur le
   * seul message candidat, il laisserait un spam masquer le dernier vrai message d'un échange — la ligne
   * disparaîtrait de la Réception sans que rien ne l'explique.
   *
   * ⚠️ `spam` FAUX (migration 263 absente) ⇒ chaînes vides : la requête est alors mot pour mot celle d'avant ce lot.
   */
  // LOT ERGO-BOITE-3 — le sélecteur « non lus ». Posé sur le seul étage `m` : il désigne des ÉCHANGES, pas des
  //   messages, et le prédicat « dernier de son sens » n'a pas à en tenir compte.
  const filtreRetenus = rangFilsRetenus === null ? '' : `AND m.fil_id = ANY($${rangFilsRetenus}::bigint[])`;
  // LOT FILTRE-ETOILE — posé sur le seul étage `m` : il désigne des ÉCHANGES, pas des messages. Le prédicat
  //   « dernier de son sens » n'a donc pas à en tenir compte.
  const filtreEtoile = etoilesSeules ? `AND ${SQL_ETOILE}` : '';
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
  const jointureClassement = !rattachements ? '' : `LEFT JOIN LATERAL (
         SELECT count(*)::int AS n,
                bool_or(r.origine = 'manuel' OR r.statut_par_libelle IS NOT NULL) AS humain,
                string_agg(
                  coalesce(nullif(btrim(r.cible_libelle), ''), r.cible_cle, 'cible ' || r.cible_id::text)
                  || CASE WHEN r.origine = 'manuel' OR r.statut_par_libelle IS NOT NULL
                          THEN ' — à la main' ELSE ' — automatique' END,
                  ' · ' ORDER BY r.id) AS detail
           FROM gestion_rattachement r
           JOIN gestion_message rm ON rm.id = r.message_id
          WHERE rm.fil_id = p.fil_id AND r.statut = 'confirme'
            AND r.cible_sorte IN ('lot', 'proprietaire')
       ) cl ON true`;

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
  const jointureHorsGestion = !horsGestion ? '' : `LEFT JOIN LATERAL (
         SELECT h.motif
           FROM gestion_hors_gestion h
          WHERE h.message_id = p.message_id AND h.retire_le IS NULL
          LIMIT 1
       ) hg ON true`;

  const estSpam = spam && etiquette.sorte !== 'spam';
  const filtreSpamM = estSpam ? 'AND m.spam_le IS NULL' : '';
  const filtreSpamM2 = estSpam ? 'AND m2.spam_le IS NULL' : '';
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
                 WHERE m2.fil_id = m.fil_id ${filtreM2} ${filtreSensM2} ${filtreSpamM2}
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
            cl.n AS cl_n, cl.humain AS cl_humain, cl.detail AS cl_detail,
            ${horsGestion ? 'hg.motif IS NOT NULL AS hg_marque, hg.motif AS hg_motif' : 'NULL::boolean AS hg_marque, NULL::text AS hg_motif'}
       FROM page p JOIN gestion_fil f ON f.id = p.fil_id
       ${jointureClassement}
       ${jointureHorsGestion}
       -- La jointure latérale sert encore : aux autres étiquettes (où le message de la ligne peut être un envoi
       --   comme une réception) pour trouver le correspondant, et à Envoyés pour retrouver le NOM du destinataire.
       --   Elle ne sert plus à Réception, où le message de la ligne EST le dernier reçu : rien à chercher.
       --   (Aucun accent GRAVE ici : ce commentaire vit DANS un littéral gabarit, qu'un seul accent grave
       --    terminerait — piège consigné trois fois dans ce dépôt, dont une fois dans ce fichier même.)
       ${sens === 'recu' ? '' : SQL_INTERLOCUTEUR}
      ORDER BY p.recu_le DESC, p.fil_id DESC`;
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

  // LOT 5-BOITE-3 — la corbeille n'entre dans le SQL que si la migration 251 est là. Sonde HORS transaction : une
  //   colonne nommée alors qu'elle n'existe pas ferait échouer TOUTE la boîte, pas seulement le geste nouveau.
  const corbeille = await corbeilleDisponible();
  // LOT ERGO-BOITE-3 — même règle pour le spam et pour la même raison : sans la migration 263, la colonne n'est
  //   nommée nulle part. Les deux sondes sont posées ENSEMBLE, en parallèle : elles sont mémoïsées et ne coûtent
  //   qu'au premier appel.
  const spam = await spamDisponible();
  // LOT CAPSULE-STATUT — même patron que les autres sondes : mémoïsée, posée hors transaction.
  const rattachements = await rattachementsDisponibles();
  // LOT STATUT-HORS-GESTION — même patron, même raison : sans la 266, la table n'est nommée nulle part.
  const horsGestion = await horsGestionDisponible();
  // LOT ERGO-BOITE-3 — les fils retenus arrivent APRÈS les paramètres de l'étiquette : leur rang dépend donc de
  //   l'étiquette ouverte, et il est calculé ici plutôt que deviné. Poser un paramètre puis calculer son rang à
  //   partir de `params.length` est le décalage d'un cran qui s'est déjà produit dans ce dépôt.
  const paramsEtiquette = parametresEtiquette(etiquette, options.fenetreJours ?? 30);
  const retenus = options.filsRetenus;
  const rangRetenus = retenus === undefined ? null : 4 + paramsEtiquette.length;
  const { rows } = await query<LigneDB>(
    sqlPageBoite(tous, etiquette, corbeille, spam, rangRetenus, options.etoilesSeules === true, rattachements,
      horsGestion),
    // `infinity` plutôt qu'une date arbitraire : il n'existe aucun message après, quelle que soit l'horloge.
    [curseur?.dernierLe ?? 'infinity', curseur?.filId ?? '9223372036854775807', aLire,
      ...paramsEtiquette, ...(retenus === undefined ? [] : [[...retenus]])],
  );

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
  const [avis, etoiles, echecsDesFils, echecsOrphelins] = await Promise.all([
    nonRemisesDesFils(filsDeLaPage),
    etoilesDesFils(filsDeLaPage),
    nonEnvoyesDesFils(filsDeLaPage),
    montrerEchecs ? nonEnvoyesAMontrer() : Promise.resolve([] as MentionNonEnvoye[]),
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
      reference: null,
      sansSuite: false,
      nonRemise: null,
      nonEnvoye: e,
      etoilee: false,
      classement: null,
      horsGestion: false,
      motifHorsGestion: null,
    })),
    suivant: aSuite && dernier ? { dernierLe: dernier.dernier_le, filId: dernier.fil_id } : null,
    // Le total N'EST COMPTÉ QUE pour la boîte entière. Sous une étiquette, c'est la colonne de gauche qui porte le
    //   nombre — et le recompter ici donnerait deux chiffres pour une seule vérité, donc tôt ou tard deux chiffres
    //   différents. `null` se lit « demande-le à l'étiquette », pas « zéro ».
    // LOT 5-BOITE-2 — les DEUX boîtes portent désormais leur total, calculé avec leur propre règle. Les autres
    //   étiquettes s'en remettent toujours à la colonne de gauche (`null` se lit « demande-le à l'étiquette »).
    total: curseur === null && (etiquette.sorte === 'reception' || etiquette.sorte === 'envoyes')
      ? await compterBoite(tous, etiquette.sorte === 'envoyes' ? 'envoye' : 'recu', corbeille, spam,
        options.etoilesSeules === true)
      : null,
  };
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
  const horsCorbeille = corbeille
    ? `AND NOT EXISTS (SELECT 1 FROM gestion_fil fc WHERE fc.id = m.fil_id
                        AND fc.corbeille_le IS NOT NULL AND fc.corbeille_le >= m.recu_le)`
    : '';
  // LOT ERGO-BOITE-3 — le spam n'entre dans AUCUN de ces deux totaux, aux deux étages : le compteur doit compter
  //   exactement ce que la liste montre, et la liste l'écarte (cf. `sqlPageBoite`).
  const horsSpamM = spam ? 'AND m.spam_le IS NULL' : '';
  const seulementEtoiles = etoilesSeules ? `AND ${SQL_ETOILE}` : '';
  const horsSpamM2 = spam ? 'AND m2.spam_le IS NULL' : '';
  const { rows } = await query<{ n: number }>(
    `SELECT count(*)::int AS n
       FROM gestion_message m
      WHERE m.sens = $1
        ${inclureAutomatiques ? '' : 'AND m.exclu_le IS NULL'}
        ${horsSpamM}
        ${seulementEtoiles}
        ${horsCorbeille}
        -- « aucun message plus récent DU MÊME SENS dans cet échange » : exactement le prédicat de la liste.
        AND NOT EXISTS (
              SELECT 1 FROM gestion_message m2
               WHERE m2.fil_id = m.fil_id AND m2.sens = m.sens
                 ${inclureAutomatiques ? '' : 'AND m2.exclu_le IS NULL'}
                 ${horsSpamM2}
                 AND (m2.recu_le, m2.id) > (m.recu_le, m.id))`,
    [sens]);
  return rows[0]?.n ?? 0;
}

/**
 * Les DEUX comptes de la boîte, pour que l'écran puisse dire ce qu'il montre ET ce qu'il ne montre pas. Un outil qui
 * cache sans le dire ment ; un outil qui annonce ce qu'il tait reste honnête — c'est la règle du module depuis le lot 4b.
 */
export async function comptesBoite(): Promise<{
  lisibles: number; automatiques: number; envoyes: number; reception: number; spam: number;
}> {
  /**
   * LOT BOITE-SENS — LES DEUX BOÎTES NE SONT PLUS DISJOINTES, ET LEUR SOMME NE VEUT PLUS RIEN DIRE.
   *
   * Un échange où l'on a reçu ET répondu compte dans les deux. `reception + envoyes` dépasse donc le nombre
   * d'échanges lisibles, et c'est normal : ce sont deux vues du même courrier, pas deux moitiés d'un tout. Rien
   * dans l'écran n'additionne ces deux nombres — et personne ne devrait s'y mettre.
   *
   * 🔴 LA CORBEILLE EST ÉCARTÉE ICI AUSSI, et par la MÊME règle que la liste : le geste doit être postérieur au
   * dernier message DU SENS affiché. Sans cela, la colonne de gauche et l'en-tête de la liste — qui sort de
   * `compterBoite` — annonceraient deux nombres différents pour la même boîte, et c'est celui de gauche qu'on
   * lit. Sans la migration 251, la colonne n'est pas nommée et le comportement est celui d'avant.
   *
   * ⚠️ UN SEUL parcours pour les quatre nombres : quatre `FILTER` sur le regroupement qui existait déjà. Même
   * balayage, même coût, et aucune chance que les compteurs se contredisent puisqu'ils sortent d'une seule lecture.
   */
  const [corbeille, spam] = await Promise.all([corbeilleDisponible(), spamDisponible()]);
  const geste = corbeille ? 'f.corbeille_le' : 'NULL::timestamptz';
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
  const compteSpam = spam
    ? '(SELECT count(*) FILTER (WHERE spam_le IS NOT NULL)::int FROM gestion_message)'
    : '0::int';
  const horsSpam = spam ? 'WHERE spam_le IS NULL' : '';
  const { rows } = await query<{ lisibles: number; total: number; envoyes: number; reception: number; spam: number }>(
    `SELECT ${compteSpam} AS spam,
            count(*) FILTER (WHERE lisibles > 0)::int AS lisibles,
            count(*)::int AS total,
            count(*) FILTER (WHERE dernier_envoye IS NOT NULL
                               AND (geste IS NULL OR geste < dernier_envoye))::int AS envoyes,
            count(*) FILTER (WHERE dernier_recu IS NOT NULL
                               AND (geste IS NULL OR geste < dernier_recu))::int AS reception
       FROM (SELECT x.fil_id, x.lisibles, x.dernier_recu, x.dernier_envoye, ${geste} AS geste
               FROM (SELECT fil_id,
                            count(*) FILTER (WHERE exclu_le IS NULL) AS lisibles,
                            max(recu_le) FILTER (WHERE exclu_le IS NULL AND sens = 'recu') AS dernier_recu,
                            max(recu_le) FILTER (WHERE exclu_le IS NULL AND sens = 'envoye') AS dernier_envoye
                       FROM gestion_message ${horsSpam} GROUP BY fil_id) x
               LEFT JOIN gestion_fil f ON f.id = x.fil_id) y`);
  const l = rows[0]?.lisibles ?? 0;
  return {
    lisibles: l, automatiques: (rows[0]?.total ?? 0) - l, envoyes: rows[0]?.envoyes ?? 0,
    reception: rows[0]?.reception ?? 0, spam: rows[0]?.spam ?? 0,
  };
}
