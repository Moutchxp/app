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

/**
 * 🔴🔴 UNE ALERTE NE DOIT JAMAIS DÉCLENCHER UNE ALERTE. Demande d'Arno, et c'est la protection contre la rafale la
 * plus importante de ce lot : l'alerte part à `gestion@`, qui est NOTRE propre boîte. Si son envoi échouait et
 * qu'on alertait là-dessus, on alerterait sur l'alerte, sans fin.
 *
 * Deux verrous, et il en faut deux :
 *   ① cette fonction — une ligne de file marquée « alerte » n'est pas une candidate à l'alerte ;
 *   ② `alerte_le` en base — une ligne déjà alertée ne l'est pas deux fois, même après un redémarrage.
 */
export function doitAlerter(l: { etat: EtatFile; alerteLe: Date | null; estUneAlerte: boolean }): boolean {
  if (l.estUneAlerte) return false;
  if (l.etat !== 'echec') return false;
  return l.alerteLe === null;
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
