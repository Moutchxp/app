/**
 * MODULE « GESTION » — LOT 5-DEST : COMPLÉTER LES DESTINATAIRES DES MESSAGES CAPTURÉS AVANT LE LOT 5-0. Module PUR
 * (aucune I/O, aucune base, aucun réseau) — tout ce qui décide se teste ici, sans boîte et sans base.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * LE TROU QU'ON COMBLE. Jusqu'au lot 5-0, la capture fondait `To` et `Cc` dans une seule colonne de texte et jetait
 * `Reply-To`. La migration 235 a créé les quatre colonnes séparées, et la capture les remplit DEPUIS. Les messages
 * d'avant, eux, portent `dest_a IS NULL` — « jamais analysé ». MESURÉ le 25/09/2026 : 27 833 lignes sur 56 724.
 * Conséquence concrète à l'écran : sur ces messages, « Répondre à tous » n'écrit qu'à l'expéditeur.
 *
 * 🔴 C'EST UNE OPÉRATION, PAS UN RÉGLAGE — exactement comme le rapatriement du lot R. Elle vit le temps d'une commande,
 * n'écrit AUCUN réglage, et ne change rien au comportement de la relève de tous les jours.
 *
 * 🔴 CE QU'ELLE NE FAIT JAMAIS : télécharger un corps ou une pièce (elle ne demande que quatre lignes d'en-tête),
 * toucher la boîte (dossier ouvert en `readOnly`/EXAMINE, aucun drapeau posé), écraser une valeur déjà analysée (le
 * `dest_a IS NULL` est porté dans le WHERE de l'UPDATE, pas seulement dans la sélection d'amont).
 *
 * 🔴 UNE SEULE FAÇON DE LIRE UNE ADRESSE. L'analyse est celle du lot 5-0 (`destinatairesSepares`, adresses.ts) — pas
 * une seconde analyse « équivalente ». Deux lectures divergentes du même en-tête produiraient deux vérités, et la plus
 * récente écraserait l'autre sans qu'on sache laquelle était juste.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { destinatairesSepares, type DestinatairesSepares } from './adresses';

/** Une ligne à compléter, telle que la base la rend. */
export interface LigneACompleter {
  id: number;
  /** Message-ID RFC, tel qu'écrit en base (chevrons compris, le plus souvent). */
  messageId: string;
  /** UID IMAP mémorisé à la capture. `null` pour les messages capturés avant la migration 231. */
  uidImap: number | null;
  /** UIDVALIDITY du dossier au moment de la capture. Un UID ne vaut QUE sous elle. */
  uidValidity: string | null;
}

/** Comment on va retrouver chaque ligne dans la boîte. */
export interface Repartition {
  /** Retrouvables directement par leur UID (le chemin rapide, et un seul aller-retour pour tout un lot). */
  parUid: { id: number; uid: number }[];
  /** À retrouver par `SEARCH HEADER Message-ID` : un aller-retour chacun, réservé à ce qui n'a pas d'UID utilisable. */
  parMessageId: LigneACompleter[];
}

/**
 * RÉPARTIT les lignes entre les deux chemins de recherche.
 *
 * ⚠️ L'UID N'EST UTILISÉ QUE SOUS SA PROPRE UIDVALIDITY. Si le serveur l'a changée (dossier recréé, boîte migrée), il a
 * RÉATTRIBUÉ les UID depuis 1 : l'ancien 4 812 désigne alors un tout autre message. Écrire les destinataires d'un
 * message dans la ligne d'un autre serait une corruption silencieuse et irréparable — et ce lot écrit justement dans
 * des lignes qu'on ne pourra plus distinguer ensuite. Au moindre doute, on retombe sur le Message-ID, qui, lui, est
 * écrit DANS le message et ne bouge jamais. PUR.
 */
export function repartir(lignes: readonly LigneACompleter[], uidValiditeCourante: string | null): Repartition {
  const parUid: { id: number; uid: number }[] = [];
  const parMessageId: LigneACompleter[] = [];
  for (const l of lignes) {
    const utilisable = l.uidImap !== null
      && l.uidValidity !== null
      && uidValiditeCourante !== null
      && String(l.uidValidity) === String(uidValiditeCourante);
    if (utilisable) parUid.push({ id: l.id, uid: l.uidImap as number });
    else parMessageId.push(l);
  }
  return { parUid, parMessageId };
}

/**
 * Le Message-ID tel qu'on le donne à `SEARCH HEADER` : SANS chevrons. Le serveur compare une SOUS-CHAÎNE de la ligne
 * d'en-tête ; les chevrons sont dans les deux, mais les retirer évite qu'un chevron manquant d'un côté fasse échouer
 * une recherche qui aurait dû aboutir. PUR.
 */
export function pourRecherche(messageId: string): string {
  return messageId.trim().replace(/^</, '').replace(/>$/, '').trim();
}

/**
 * CE QUE RÉPOND UNE RECHERCHE IMAP — et pourquoi il faut faire la différence.
 *
 * 🔴 DÉFAUT MESURÉ le 25/09/2026, en pleine opération (passe 2, après 941 lectures réussies). `imapflow.search()` a
 * DEUX façons de ne rien rendre, et elles ne veulent pas dire la même chose (`node_modules/imapflow/lib/imap-flow.js`,
 * lignes 3254-3260) :
 *   · `false` — la recherche a bien eu lieu, elle ne trouve rien. C'est une RÉPONSE : le message est introuvable ;
 *   · `undefined` — `if (!this.mailbox) return;` : AUCUN dossier n'est sélectionné, la recherche n'a jamais été faite.
 *     Ce n'est pas une réponse, c'est une panne d'état.
 *
 * Les confondre coûterait exactement ce que ce dépôt refuse : des messages marqués « introuvables dans la boîte »
 * alors que la boîte n'a même pas été interrogée — un échec déguisé en constat, et 25 000 lignes déclarées perdues
 * pour une connexion à rouvrir. Le premier jet ne traitait que `false` et jetait sur `undefined.length`. PUR.
 */
export type ReponseRecherche =
  | { sorte: 'resultats'; uids: number[] }
  | { sorte: 'dossier_perdu' };

/** Traduit la réponse brute d'`imapflow.search()`. PUR. */
export function lireReponseRecherche(brut: unknown): ReponseRecherche {
  if (Array.isArray(brut)) return { sorte: 'resultats', uids: brut as number[] };
  if (brut === false) return { sorte: 'resultats', uids: [] }; // la recherche a eu lieu : personne ne répond
  return { sorte: 'dossier_perdu' };                            // elle n'a PAS eu lieu : rien à en conclure
}

/** Ce qu'on écrira pour une ligne : les quatre listes, analysées par le code du lot 5-0. */
export interface AEcrire {
  id: number;
  destinataires: DestinatairesSepares;
}

/**
 * Traduit un bloc d'en-têtes déjà lu en valeurs à écrire. Un en-tête ABSENT donne `[]` et non `null` : c'est toute la
 * convention de la migration 235 — `[]` dit « on a regardé, il n'y avait personne », `NULL` dit « on n'a jamais
 * regardé ». Un message relu sans `Cc` doit donc sortir d'ici avec un `cc` VIDE, et cesser d'être « jamais analysé ». PUR.
 */
export function valeursAEcrire(id: number, entetes: Record<string, string>): AEcrire {
  return { id, destinataires: destinatairesSepares(entetes) };
}

/** Compteurs d'une passe. Tout ce que la commande rapporte, et tout ce qui part au journal. */
export interface RapportCompletion {
  /** Lignes candidates lues en base (celles où `dest_a IS NULL`). */
  lus: number;
  /**
   * Lignes pour lesquelles on a RÉELLEMENT demandé ses en-têtes au serveur.
   *
   * 🔴 DISTINCT DE `lus`, ET C'EST TOUT L'ENJEU DE `passeMuette`. Une ligne dont le Message-ID est ambigu, ou
   * introuvable par la recherche, ne donne lieu à AUCUNE demande d'en-tête : le serveur n'a rien refusé, on ne lui a
   * rien demandé. Confondre les deux ferait diagnostiquer « le fournisseur ne sert plus rien » sur une passe où il
   * n'est pour rien — et enverrait attendre une limite de téléchargement qui n'existe pas.
   */
  demandes: number;
  /** Lignes pour lesquelles le serveur a RÉELLEMENT servi des en-têtes. */
  entetesObtenus: number;
  /** Lignes réellement écrites — le `rowCount` de l'UPDATE, jamais une intention. En simulation : ce qui SERAIT écrit. */
  completes: number;
  /** Aucun message correspondant dans la boîte (UID disparu, ou aucune réponse à la recherche par Message-ID). */
  introuvables: number;
  /** Plusieurs messages répondent au même Message-ID : on ne choisit pas au hasard, on laisse `NULL`. */
  ambigus: number;
  /** L'UPDATE n'a touché aucune ligne : une autre passe avait complété entre-temps. Ni un succès ni un échec. */
  dejaFaits: number;
  /** Lecture refusée par le serveur pour cette ligne. */
  echecs: number;
  /** Ce qui reste à compléter en base APRÈS la passe (0 = terminé). */
  resteNull: number;
  /** Quelques exemples lisibles, adresses TRONQUÉES — un compte rendu n'a aucune raison d'être nominatif. */
  exemples: string[];
}

/** Un rapport vide, point de départ d'une passe. PUR. */
export function rapportVide(): RapportCompletion {
  return { lus: 0, demandes: 0, entetesObtenus: 0, completes: 0, introuvables: 0, ambigus: 0, dejaFaits: 0, echecs: 0, resteNull: 0, exemples: [] };
}

/**
 * Tronque une adresse pour un compte rendu : on garde de quoi RECONNAÎTRE, jamais de quoi contacter. `jean.dupont@ex.fr`
 * → `je…@ex.fr`. Une adresse trop courte pour être tronquée est remplacée par `…` : mieux vaut un exemple muet qu'une
 * adresse complète dans un journal de terminal. PUR.
 */
export function tronquerAdresse(adresse: string): string {
  const at = adresse.lastIndexOf('@');
  if (at <= 0) return '…';
  const local = adresse.slice(0, at);
  const domaine = adresse.slice(at);
  return local.length <= 2 ? `…${domaine}` : `${local.slice(0, 2)}…${domaine}`;
}

/** Un exemple de ce qui serait écrit, en une ligne, adresses tronquées. PUR. */
export function exemple(a: AEcrire): string {
  const liste = (l: { adresse: string }[]): string => (l.length === 0 ? '—' : l.map((x) => tronquerAdresse(x.adresse)).join(', '));
  const d = a.destinataires;
  return `message ${a.id} · À : ${liste(d.a)} · Cc : ${liste(d.cc)} · Cci : ${liste(d.cci)} · Répondre-à : ${liste(d.repondreA)}`;
}

/** Combien d'exemples on imprime. Assez pour juger, trop peu pour constituer un fichier d'adresses. */
export const EXEMPLES_MAX = 5;

/**
 * UNE PASSE MUETTE : on a DEMANDÉ des en-têtes au serveur, et il n'en a servi AUCUN.
 *
 * 🔴 MÊME RÈGLE QUE LA RELÈVE, ET POUR LA MÊME RAISON MESURÉE (nuits des 23 et 24/09/2026) : quand Gmail atteint sa
 * limite de téléchargement, il ne renvoie NI erreur NI code — il annonce les messages et n'en sert plus le contenu.
 * Sans ce test, la passe se terminerait « réussie », l'attente croissante ne s'appliquerait jamais, et la boucle
 * conclurait à tort au surplace. Le seuil est STRICT (aucun, pas « peu ») : une passe qui avance encore n'est jamais
 * traitée comme un échec.
 *
 * ⚠️ LE DÉNOMINATEUR EST `demandes`, PAS `lus`. Une passe entièrement faite de Message-ID ambigus ne demande aucun
 * en-tête : elle n'apprend rien sur l'état du serveur, et l'accuser de ne plus rien servir enverrait attendre une
 * limite imaginaire au lieu de constater, à raison, qu'il reste des lignes non complétables. PUR.
 */
export function passeMuette(r: RapportCompletion | null): boolean {
  return r !== null && r.demandes > 0 && r.entetesObtenus === 0;
}

/** Issue d'une passe. `inactif` et `occupe` ne sont PAS des erreurs — même convention que la relève. */
export interface IssueCompletion {
  resultat: 'ok' | 'erreur' | 'inactif' | 'occupe';
  raison: string;
  rapport: RapportCompletion | null;
}
