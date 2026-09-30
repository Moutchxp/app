/**
 * MODULE « GESTION » — LOT ENVOI-ARRIERE-PLAN : CE QUI DÉCIDE D'UN ENVOI DIFFÉRÉ. Module PUR : aucun import,
 * aucune base, aucun réseau, aucun DOM.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LA RÈGLE QUI COMMANDE TOUT LE RESTE : JAMAIS D'ENVOI PARTIEL.
 *
 * Un mail part avec TOUTES ses pièces, ou il ne part pas. C'est la seule règle qui tienne, parce que l'erreur inverse
 * est invisible de notre côté : un bail envoyé sans son annexe arrive chez le locataire, il le lit, il ne sait pas
 * qu'il manque quelque chose, et nous non plus. Un mail qui ne part pas, lui, se voit — à condition qu'on le DISE,
 * d'où l'alerte et le retour en brouillon.
 *
 * 🔴 CE QUI EST DIFFÉRÉ, ET CE QUI NE L'EST PAS. L'ATTENTE est différée, pas la DÉCISION. Tout ce qui peut refuser
 * un envoi — le droit, la validité du brouillon, la taille des pièces — est tranché AU CLIC, pendant que la personne
 * est là pour l'entendre. Ce qui part en tâche de fond est seulement ce qui prend du temps sans rien décider :
 * récupérer des octets, et les remettre à Gmail.
 *
 * 🔴 L'HEURE DU MAIL EST CELLE DE GMAIL, JAMAIS CELLE DU CLIC. La file garde `demande_le` pour l'alerte
 * (« vous avez cliqué à 18 h 12 »), et rien d'autre : dater un mail de l'heure du clic serait antidater un document
 * qui part chez des tiers, et le mensonge se propagerait dans toutes les boîtes qui le reçoivent.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** L'état d'une pièce, du point de vue de la file. */
export type EtatPiece = 'prete' | 'attente' | 'echec';

/** L'état d'une ligne de la file. */
export type EtatFile = 'attente' | 'en_cours' | 'envoye' | 'echec';

/**
 * 🔴 COMBIEN DE FOIS ON REESSAIE, ET POURQUOI CE CHIFFRE.
 *
 * Trois tentatives couvrent ce qu'on veut couvrir : une coupure réseau, un `429` de Google, un jeton qui vient
 * d'expirer. Au-delà, ce n'est plus une erreur passagère mais un fichier qu'on ne peut pas lire — et s'acharner
 * retarde seulement le moment où on le DIT. Mieux vaut alerter en trois minutes qu'échouer en silence pendant une
 * heure.
 */
export const ESSAIS_MAX = 3;

/**
 * L'ATTENTE AVANT UNE NOUVELLE TENTATIVE, en secondes. Croissante : réessayer dans la seconde sur un service qui
 * vient de dire « trop de requêtes » est la meilleure façon de se faire refuser plus longtemps. PUR.
 */
export function attenteAvantReprise(essais: number): number {
  const paliers = [5, 20, 60];
  return paliers[Math.min(Math.max(0, essais), paliers.length - 1)];
}

/**
 * 🔴 UN BAIL, PARCE QU'UN PROCESSUS PEUT MOURIR. Une ligne prise par un travailleur porte `pris_le`. Si le processus
 * disparaît (redémarrage, plantage, déploiement), la ligne resterait « en cours » pour toujours — c'est-à-dire un
 * mail qui ne part jamais et dont personne n'est prévenu. Au-delà de ce délai, elle est reprise par le suivant.
 *
 * ⚠️ GÉNÉREUX EXPRÈS : plus court que le temps d'un envoi réel, il ferait partir le même mail DEUX FOIS. Cinq
 * minutes laissent largement le temps à six pièces de se télécharger et à Gmail de répondre. Et le second envoi est
 * de toute façon arrêté par la clé d'idempotence de `gestion_envoi` — ce bail est la première barrière, pas la seule.
 */
export const BAIL_SECONDES = 300;

/** Une ligne est-elle reprenable, c'est-à-dire abandonnée par un travailleur mort ? PUR. */
export function bailExpire(prisLe: Date | null, maintenant: Date, bailS = BAIL_SECONDES): boolean {
  if (prisLe === null) return true;
  return (maintenant.getTime() - prisLe.getTime()) / 1000 >= bailS;
}

/**
 * ══ 🔴 CE MAIL PEUT-IL PARTIR ? ══════════════════════════════════════════════════════════════════════════════════
 *
 * La question se pose sur l'ÉTAT DE SES PIÈCES, et sur rien d'autre :
 *   · une seule pièce en échec ⇒ **on renonce**. Pas d'envoi amputé, pas d'attente indéfinie ;
 *   · une seule pièce encore en attente ⇒ on repasse plus tard ;
 *   · toutes prêtes (ou aucune pièce) ⇒ on envoie.
 *
 * ⚠️ L'ÉCHEC L'EMPORTE SUR L'ATTENTE, et l'ordre compte. Un mail à six pièces dont une est perdue et deux encore en
 * route doit alerter MAINTENANT : attendre les deux autres ne changerait rien au verdict, et retarderait d'autant
 * le moment où quelqu'un peut agir.
 */
export function verdictPieces(etats: readonly EtatPiece[]): { v: 'pret' } | { v: 'attendre' } | { v: 'echec' } {
  if (etats.some((e) => e === 'echec')) return { v: 'echec' };
  if (etats.some((e) => e === 'attente')) return { v: 'attendre' };
  return { v: 'pret' };
}

/**
 * LE MOT DE L'ÉTAT, tel qu'il s'affiche. Le MOT porte l'information, jamais la couleur seule — règle du module. PUR.
 */
export function motEtatFile(e: EtatFile): string {
  switch (e) {
    case 'attente': return 'Envoi en cours';
    case 'en_cours': return 'Envoi en cours';
    case 'envoye': return 'Envoyé';
    case 'echec': return 'Non envoyé';
    default: return 'Envoi en cours';
  }
}

/**
 * 🔴 LE TON DE LA CAPSULE. « Non envoyé » est le SEUL état rouge : c'est le seul qui demande un geste. « Envoi en
 * cours » est neutre — il ne s'affiche que quelques secondes, et en faire une alerte ferait paraître anormal ce qui
 * est le fonctionnement ordinaire.
 */
export function tonEtatFile(e: EtatFile): 'neutre' | 'rouge' {
  return e === 'echec' ? 'rouge' : 'neutre';
}

/**
 * ══ 🔴 LA CAUSE, EN FRANÇAIS SIMPLE ══════════════════════════════════════════════════════════════════════════════
 *
 * Demande d'Arno : « la cause en français simple ». Un message d'alerte qui dit `ECONNRESET` ou `HTTP 403` fait
 * chercher un informaticien ; un message qui dit quelle pièce manque fait agir tout de suite. On NOMME donc le
 * fichier, et l'on dit ce qu'on a essayé.
 *
 * ⚠️ LE MOTIF TECHNIQUE N'EST PAS JETÉ — il est mis À LA FIN, entre parenthèses. Quand la phrase simple ne suffit
 * pas, c'est lui qui permet de comprendre ; le cacher obligerait à ouvrir les journaux du serveur.
 */
export function causeEnFrancais(c:
  | { sorte: 'piece'; nom: string; detail?: string | null }
  | { sorte: 'gmail'; detail?: string | null }
  | { sorte: 'inconnue'; detail?: string | null }): string {
  const technique = (c.detail ?? '').trim();
  const suffixe = technique === '' ? '' : ` (${technique})`;
  switch (c.sorte) {
    case 'piece':
      return `la pièce « ${c.nom} » n’a pas pu être récupérée depuis le Drive, même après plusieurs tentatives`
        + `${suffixe}.`;
    case 'gmail':
      return `Gmail a refusé l’envoi${technique === '' ? '' : ` : ${technique}`}.`;
    default:
      return `l’envoi n’a pas abouti${suffixe}.`;
  }
}

/** L'objet de l'alerte. Demande d'Arno, mot pour mot. PUR. */
export function objetAlerte(objetOrigine: string): string {
  const o = objetOrigine.trim();
  return `⚠️ Mail non envoyé : ${o === '' ? '(sans objet)' : o}`;
}

/** Une date, en français, pour le corps de l'alerte. PUR (la locale est passée, jamais lue de l'environnement). */
export function heureFr(d: Date): string {
  const deuxChiffres = (n: number) => String(n).padStart(2, '0');
  return `${deuxChiffres(d.getDate())}/${deuxChiffres(d.getMonth() + 1)}/${d.getFullYear()}`
    + ` à ${deuxChiffres(d.getHours())} h ${deuxChiffres(d.getMinutes())}`;
}

/**
 * ══ 🔴 LE CORPS DE L'ALERTE ══════════════════════════════════════════════════════════════════════════════════════
 *
 * Il répond aux quatre questions qu'on se pose en le lisant, dans cet ordre : QUOI n'est pas parti, À QUI, QUAND on
 * a cliqué, POURQUOI — et il finit par le geste : le lien vers le brouillon.
 *
 * 🔴 IL DIT QUE LE MAIL EST EN BROUILLON, parce que c'est la seule chose qui rassure vraiment : le travail n'est pas
 * perdu, et les pièces déjà récupérées y sont encore. Sans cette phrase, on rouvre tout pour vérifier.
 */
export function corpsAlerte(a: {
  objet: string;
  destinataires: readonly string[];
  cliqueLe: Date;
  cause: string;
  lienBrouillon: string;
}): string {
  const dest = a.destinataires.filter((d) => d.trim() !== '');
  return [
    'Ce message n’est PAS parti.',
    '',
    `Objet : ${a.objet.trim() === '' ? '(sans objet)' : a.objet.trim()}`,
    `Destinataires : ${dest.length === 0 ? '(aucun)' : dest.join(', ')}`,
    `Envoi demandé le ${heureFr(a.cliqueLe)}`,
    '',
    `Cause : ${a.cause}`,
    '',
    'Rien n’est perdu : le message est retourné dans les Brouillons, avec son texte et les pièces déjà récupérées.',
    `Pour le reprendre et le renvoyer : ${a.lienBrouillon}`,
  ].join('\n');
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT PJ-APRES-VIDAGE — UN ÉCHEC = UN BANDEAU. REGROUPER LES TENTATIVES IDENTIQUES.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   CONSTAT D'ARNO, mesuré en base le 30/09/2026 sur le fil 3494 : DEUX clics sur « transférer », DEUX lignes de file
   (12 et 14), MÊME brouillon (64), MÊME cause au mot près, DEUX alertes envoyées — et à l'écran QUATRE bandeaux :
   deux en tête de page et deux dans le fil.

   🔴 LES QUATRE VIENNENT DE DEUX CAUSES DIFFÉRENTES, et il faut les traiter toutes les deux :
     ① LE DOUBLE MONTAGE — `GestionVue` pose un bandeau GÉNÉRAL en tête, `Conversation` en pose un BORNÉ au fil
        ouvert. Quand on regarde le fil concerné, le même échec est donc annoncé deux fois, à dix centimètres
        d'intervalle. La borne `sauf` du bandeau général ferme ce trou : ce que le fil ouvert dit déjà, la tête de
        page ne le redit pas.
     ② LA RÉPÉTITION — deux tentatives identiques font deux lignes. Les montrer séparément n'apprend rien de plus
        qu'un nombre : c'est le MÊME message, la MÊME cause, et le MÊME geste à faire. On les regroupe.

   ⚠️ « IDENTIQUE » SE DÉFINIT, SINON IL SE DEVINE. Deux tentatives sont la même quand tout ce que le bandeau
   AFFICHE est le même : l'état, l'échange, l'objet, les destinataires et la cause. Regrouper sur moins (le seul
   fil, par exemple) masquerait deux échecs DIFFÉRENTS du même échange — et l'un des deux ne serait jamais réparé.
*/

/** La signature d'affichage d'une ligne : tout ce que le bandeau en montre, et rien d'autre. PUR. */
export function signatureEnvoi(l: {
  etat: EtatFile; filId: number | null; objet: string; destinataires: readonly string[]; cause: string | null;
}): string {
  return [l.etat, l.filId ?? 'sans-fil', l.objet.trim(), [...l.destinataires].join('|'), (l.cause ?? '').trim()]
    .join('␟');
}

/** Une tentative, ou plusieurs tentatives identiques, telles qu'elles s'affichent. */
export interface EnvoiGroupe<T> {
  /** La tentative la PLUS RÉCENTE — c'est elle qui porte le brouillon à rouvrir et l'heure à afficher. */
  ligne: T;
  /** Combien de tentatives identiques ce bandeau résume. 1 = le cas ordinaire. */
  nb: number;
  /** Les identifiants de toutes les tentatives résumées, de la plus récente à la plus ancienne. */
  ids: number[];
}

/**
 * REGROUPE LES TENTATIVES IDENTIQUES. PUR, et STABLE : l'ordre d'entrée est conservé, à la place de la PREMIÈRE
 * occurrence du groupe. Retrier ferait sauter un bandeau d'un endroit à l'autre entre deux relectures.
 *
 * ⚠️ LA LIGNE RETENUE EST LA PLUS RÉCENTE, pas la première rencontrée : c'est son brouillon qu'on veut rouvrir, et
 * c'est son heure qui dit quand on a essayé pour la dernière fois.
 */
export function grouperEnvois<T extends {
  id: number; etat: EtatFile; filId: number | null; objet: string; destinataires: string[];
  cause: string | null; demandeLe: string;
}>(lignes: readonly T[]): EnvoiGroupe<T>[] {
  const ordre: string[] = [];
  const par = new Map<string, EnvoiGroupe<T>>();
  for (const l of lignes) {
    const cle = signatureEnvoi(l);
    const deja = par.get(cle);
    if (deja === undefined) {
      ordre.push(cle);
      par.set(cle, { ligne: l, nb: 1, ids: [l.id] });
    } else {
      deja.nb += 1;
      deja.ids.push(l.id);
      if (l.demandeLe > deja.ligne.demandeLe) deja.ligne = l;
    }
  }
  // Les identifiants du plus récent au plus ancien, comme les lignes : un ordre qui change selon l'entrée serait
  //   illisible dans un titre d'infobulle.
  for (const g of par.values()) g.ids.sort((a, b) => b - a);
  return ordre.map((c) => par.get(c) as EnvoiGroupe<T>);
}

/**
 * LE MOT D'UN GROUPE. Une seule tentative garde le mot de l'état ; plusieurs disent COMBIEN. PUR.
 *
 * 🔴 LE NOMBRE EST DANS LE MOT, pas dans une pastille à côté : c'est le mot que lit une synthèse vocale, et
 * « Non envoyé » répété deux fois ne dirait pas la même chose que « 2 tentatives non envoyées ».
 */
export function motGroupeEnvoi(etat: EtatFile, nb: number): string {
  if (nb <= 1) return motEtatFile(etat);
  if (etat === 'echec') return `${nb} tentatives non envoyées`;
  return `${nb} envois en cours`;
}

/**
 * 🔴🔴 UNE ALERTE NE DOIT JAMAIS DÉCLENCHER UNE ALERTE. Demande d'Arno, et c'est la protection contre la rafale la
 * plus importante de ce lot : l'alerte part à `gestion@`, qui est NOTRE propre boîte. Si son envoi échouait et
 * qu'on alertait là-dessus, on alerterait sur l'alerte, sans fin.
 *
 * Deux verrous, et il en faut deux :
 *   ① cette fonction — une ligne de file marquée « alerte » n'est pas une candidate à l'alerte ;
 *   ② `alerte_le` en base — une ligne déjà alertée ne l'est pas deux fois, même après un redémarrage.
 */
export function doitAlerter(l: {
  etat: EtatFile; alerteLe: Date | null; estUneAlerte: boolean;
  /**
   * 🔴 LOT PJ-APRES-VIDAGE — TROISIÈME VERROU : « la MÊME panne a DÉJÀ été signalée, il y a peu ».
   *
   * Demande d'Arno : « un échec = UN bandeau et UNE alerte ». Les deux verrous ci-dessus ne voient qu'une LIGNE :
   * deux clics sur « transférer » font deux lignes, donc deux alertes, et c'est ce qui est arrivé le 30/09 à
   * 14:55 et 14:56 — deux mails identiques dans la boîte pour une seule chose à réparer.
   *
   * ⚠️ « RÉCEMMENT », ET PAS « JAMAIS » : la panne peut être réparée puis revenir, et la seconde fois mérite
   * d'être dite. C'est l'appelant qui fixe la fenêtre — la décision, elle, s'écrit ici.
   *
   * Absent = `false` : un appelant qui ne sait pas répondre ne doit pas faire TAIRE une alerte.
   */
  dejaSignaleRecemment?: boolean;
}): boolean {
  if (l.estUneAlerte) return false;
  if (l.etat !== 'echec') return false;
  if (l.dejaSignaleRecemment === true) return false;
  return l.alerteLe === null;
}

/**
 * ══ 🔴 LOT LIGNE-NON-ENVOYE — CE QU'UNE LIGNE DE LISTE DOIT DIRE D'UN MAIL QUI N'EST PAS PARTI ═══════════════════
 *
 * Demande d'Arno : la capsule rouge « Non envoyé » doit se voir DANS « Envoyés » et DANS le fil, pas seulement
 * dans un bandeau en tête. La raison est la même que pour les avis de non-remise (lot ENVOI-DIAG) : c'est la seule
 * chose qu'on ne peut pas apprendre en ouvrant l'échange plus tard. Sans elle, il faudrait ouvrir les 6 580
 * échanges d'« Envoyés » pour espérer tomber sur celui qui n'est pas parti.
 */
export interface MentionNonEnvoye {
  /** La ligne de file d'où vient la mention. Sert de clé d'affichage — deux échecs sur le même fil sont possibles. */
  fileId: number;
  /** L'échange concerné. `null` = message NEUF : il n'a pas encore de fil, donc pas de ligne où s'accrocher. */
  filId: number | null;
  objet: string;
  destinataires: string[];
  /** La cause, EN FRANÇAIS, déjà rédigée par le travailleur (`causeEnFrancais`). */
  cause: string | null;
  /** L'heure du clic, en ISO. C'est elle qui donne sa place chronologique à la ligne. */
  demandeLe: string;
  /** Le brouillon où le message est retourné. C'est lui qu'ouvre « Rouvrir le brouillon ». */
  brouillonId: number | null;
}

/**
 * ══ 🔴 FUSIONNER LES ÉCHECS DANS UNE LISTE D'ÉCHANGES. PUR. ═════════════════════════════════════════════════════
 *
 * Deux cas, et ils ne se traitent pas de la même façon :
 *   ① L'ÉCHEC PORTE UN FIL DÉJÀ PRÉSENT dans la page → on POSE la mention sur cette ligne. C'est le cas courant
 *      (une réponse qui ne part pas), et il ne faut surtout pas créer une seconde ligne : l'échange apparaîtrait
 *      deux fois dans la liste, une fois normal et une fois en rouge.
 *   ② L'ÉCHEC N'A PAS DE FIL, ou son fil n'est pas sur cette page → on INSÈRE une ligne, à sa place
 *      CHRONOLOGIQUE. Un message neuf qui ne part pas n'a aucun échange où se ranger : sans cette ligne, il
 *      n'apparaîtrait nulle part, et c'est exactement le mail qu'on croit envoyé.
 *
 * ⚠️ L'ORDRE DE LA LISTE EST CELUI DE LA LISTE, et on ne le recalcule pas : on insère chaque échec devant la
 * première ligne plus ANCIENNE que lui. Trier l'ensemble ferait bouger des lignes qui n'ont pas changé, et la page
 * suivante (qui se demande avec un curseur) ne correspondrait plus.
 */
export function fusionnerNonEnvoyes<T extends { filId: number; dernierLe: string }>(
  lignes: readonly T[],
  echecs: readonly MentionNonEnvoye[],
  fabriquer: (e: MentionNonEnvoye) => T,
): (T & { nonEnvoye?: MentionNonEnvoye | null })[] {
  if (echecs.length === 0) return [...lignes];

  const presents = new Set(lignes.map((l) => l.filId));
  const parFil = new Map<number, MentionNonEnvoye>();
  const orphelins: MentionNonEnvoye[] = [];
  for (const e of echecs) {
    if (e.filId !== null && presents.has(e.filId)) {
      // ⚠️ LE PLUS RÉCENT GAGNE si deux échecs portent le même fil : une ligne ne peut porter qu'une capsule, et
      //   c'est le dernier état qui intéresse.
      const deja = parFil.get(e.filId);
      if (!deja || deja.demandeLe < e.demandeLe) parFil.set(e.filId, e);
    } else {
      orphelins.push(e);
    }
  }

  const avecMention = lignes.map((l) => {
    const m = parFil.get(l.filId);
    return m ? { ...l, nonEnvoye: m } : l;
  });

  // Les orphelins, du plus récent au plus ancien : on les insère un par un, chacun devant la première ligne
  //   plus ancienne que lui. La liste étant déjà décroissante, l'insertion garde l'ordre.
  const sortis = [...orphelins].sort((a, b) => (a.demandeLe < b.demandeLe ? 1 : -1));
  const sortie: (T & { nonEnvoye?: MentionNonEnvoye | null })[] = [...avecMention];
  for (const e of sortis) {
    const rang = sortie.findIndex((l) => l.dernierLe <= e.demandeLe);
    const ligne = { ...fabriquer(e), nonEnvoye: e };
    if (rang < 0) sortie.push(ligne); else sortie.splice(rang, 0, ligne);
  }
  return sortie;
}

/**
 * LE PLAFOND DE TAILLE, TRANCHÉ AU CLIC. PUR.
 *
 * 🔴 SUR LES TAILLES ANNONCÉES PAR LE DRIVE, et c'est le point délicat de ce lot : on accepte une pièce AVANT
 * d'avoir ses octets. On se fie donc à la taille des métadonnées — qui est juste, mais qu'on ne peut pas vérifier
 * tant qu'on n'a pas téléchargé.
 *
 * ⚠️ D'OÙ LE SECOND CONTRÔLE, plus tard : quand les octets arrivent, leur taille RÉELLE est reprise, et un envoi
 * qui dépasserait alors la limite échoue proprement (alerte + brouillon) au lieu d'être refusé par Gmail avec un
 * message que personne ne comprend. Refuser tôt évite 99 % des cas ; vérifier tard couvre le dernier pour cent.
 */
export function placePourLaPiece(o: {
  dejaJoint: number; taillePiece: number; plafond: number;
}): { ok: true } | { ok: false; motif: string } {
  const mo = (n: number) => `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
  if (o.taillePiece < 0) return { ok: false, motif: 'La taille de ce fichier est inconnue.' };
  if (o.dejaJoint + o.taillePiece > o.plafond) {
    return {
      ok: false,
      motif: `Cette pièce ferait dépasser la limite : ${mo(o.dejaJoint)} déjà joints, `
        + `${mo(o.taillePiece)} pour celle-ci, ${mo(o.plafond)} au maximum.`,
    };
  }
  return { ok: true };
}
