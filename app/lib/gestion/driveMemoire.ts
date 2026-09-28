/**
 * MODULE « GESTION » — LOT APERCU-RAPIDE : UNE MÉMOIRE COURTE DES LECTURES DE MÉTADONNÉES DU DRIVE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE QU'ELLE RÉPARE, MESURÉ LE 29/09/2026 SUR LE VRAI DRIVE.
 *
 * Avant d'afficher le moindre pixel, l'aperçu doit savoir si le fichier est sous « Documents clients scannés ». Ce
 * verdict remonte la chaîne des parents, un `files.get` par niveau, EN SÉRIE — l'arborescence du cabinet en fait 6
 * à 7. Chronométré :
 *
 *     fichier     chaîne des parents        1 `files.get` isolé
 *     0,14 Mo      1 700 ms (6 niveaux)          388 ms
 *     1,35 Mo      2 360 ms (7 niveaux)          407 ms
 *     2,84 Mo      1 947 ms (6 niveaux)          269 ms
 *
 * Deux secondes d'attente avant de commencer à lire le document. Et on les repayait ENTIÈREMENT au fichier
 * suivant du même dossier — alors que les six ancêtres étaient exactement les mêmes.
 *
 * 🔴 LA MÉMOIRE PORTE SUR LES MÉTADONNÉES D'UN DOSSIER, PAS SUR LE CONTENU D'UN FICHIER. Aucun octet de document
 * client ne s'y trouve : un nom de dossier et l'identifiant de son parent, rien d'autre. Rien n'est écrit sur le
 * disque, rien n'est écrit dans le Drive, et tout meurt avec le processus.
 *
 * ═══ ⚠️ POURQUOI LA DURÉE EST COURTE, ET POURQUOI ELLE EST CE QU'ELLE EST ═══════════════════════════════════════
 * Cette mémoire porte une information de SÉCURITÉ : « ce dossier n'est pas sous l'archive ». Si quelqu'un DÉPLACE
 * un dossier dans « Documents clients scannés », une mémoire trop longue continuerait d'autoriser la lecture de
 * son contenu — précisément ce que la règle interdit.
 *
 * 60 secondes est le compromis assumé : assez pour couvrir la rafale d'un parcours (on ouvre cinq aperçus d'affilée
 * dans le même dossier), trop court pour survivre à un rangement fait entre-temps. Un déplacement suivi d'un aperçu
 * dans la même minute reste possible en théorie ; c'est le seul trou, il est nommé, et il se referme en une minute.
 *
 * ⚠️ LA CLÉ PORTE LE SUJET (l'adresse au nom de laquelle on agit). Google applique les droits de CETTE personne :
 * une mémoire partagée entre deux collaborateurs ferait voir à l'un ce que l'autre seul peut lire. C'est le genre
 * de fuite qu'un cache introduit sans bruit, et elle est fermée par la clé.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { chaineParents, lireMetadonnees, type MetaFichier } from './drive';
import type { DepsGoogle, Resultat } from './google';

/** La durée de vie d'une entrée. Voir l'en-tête : c'est un choix de sécurité, pas un réglage de confort. */
export const MEMOIRE_MS = 60_000;

interface Entree<T> { valeur: T; expireA: number }

const metadonnees = new Map<string, Entree<Resultat<MetaFichier>>>();
const chaines = new Map<string, Entree<{ id: string; nom: string; parentId: string | null }[]>>();

/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LOT APERCU-PAGE1 — UNE MÉMOIRE DES OCTETS, ET LÀ IL S'AGIT BIEN DU CONTENU D'UN DOCUMENT CLIENT.
 *
 * CE QUI L'A RENDUE NÉCESSAIRE, mesuré le 29/09/2026 depuis la page elle-même, sur le vrai Drive :
 *
 *     document                         ouverture par PDF.js   tramage de la page 1   TOTAL
 *     Acte de propriété.pdf (3,3 Mo)        1 117 ms                  46 ms        1 163 ms
 *     Charges 2025.2026.pdf (1,4 Mo)        1 407 ms                 105 ms        1 512 ms
 *     Carte identite.pdf (410 ko)           1 095 ms                 155 ms        1 250 ms
 *     Avis d’impôt 2019 (99 ko)             1 049 ms                  57 ms        1 106 ms
 *
 * 🔴 LA PAGE 1 SE TRAME EN 46 À 155 MILLISECONDES. Tout le reste est le trajet des octets depuis Google — environ
 * une seconde, QUELLE QUE SOIT LA TAILLE : c'est de la latence, pas du débit. Et on la repayait ENTIÈREMENT à
 * chaque réouverture du même document, et à chaque retour par « Précédent ».
 *
 * ⚠️ LA MÉMOIRE NE DISPENSE JAMAIS DU VERDICT. La route prononce l'interdit de « Documents clients scannés » AVANT
 * de regarder ici : la mémoire ne rend des octets qu'à quelqu'un qui vient d'obtenir le droit de les lire. Elle
 * épargne le TRANSPORT, jamais la règle.
 *
 * ⚠️ LA CLÉ PORTE LE SUJET, comme pour les métadonnées : Google applique les droits de la personne au nom de qui
 * l'on agit, et deux collaborateurs ne voient pas le même Drive. Elle porte aussi la TAILLE du fichier : un
 * document réécrit entre-temps change presque toujours de taille, et la durée de vie borne le reste à une minute.
 *
 * 🔒 EN MÉMOIRE DU PROCESSUS, ET NULLE PART AILLEURS : rien sur le disque, rien dans le Drive, tout meurt avec le
 * processus. Le plafond total est volontairement petit — c'est un tampon de parcours, pas un stockage.
 * ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
/** Au-delà, on ne retient pas : un seul gros document chasserait tout le reste pour un gain d'une seule ouverture. */
export const OCTETS_MAX_FICHIER = 12 * 1024 * 1024;
/** Le plafond de l'ensemble. Atteint, on oublie les plus anciennement posés jusqu'à repasser dessous. */
export const OCTETS_MAX_TOTAL = 32 * 1024 * 1024;

const octets = new Map<string, Entree<Uint8Array>>();

/** Pour les tests, et pour une passe qui voudrait repartir à neuf. Sans effet sur le Drive. */
export function oublierLeDrive(): void {
  metadonnees.clear();
  chaines.clear();
  octets.clear();
}

/** Combien d'entrées sont retenues. Sert aux mesures et aux tests — jamais à l'écran. */
export function tailleMemoire(): { metadonnees: number; chaines: number; octets: number; octetsTotal: number } {
  let total = 0;
  for (const e of octets.values()) total += e.valeur.byteLength;
  return { metadonnees: metadonnees.size, chaines: chaines.size, octets: octets.size, octetsTotal: total };
}

/** La clé d'un contenu. Le sujet ferme la fuite entre collaborateurs, la taille borne le risque de péremption. */
export function cleOctets(sujet: string, fichierId: string, taille: number | null): string {
  return `${sujet}|${fichierId}|${taille ?? '?'}`;
}

/** Les octets retenus pour ce fichier, ou `null`. Le verdict a DÉJÀ été prononcé par l'appelant. */
export function octetsMemo(cle: string, maintenant = Date.now()): Uint8Array | null {
  return lire(octets, cle, maintenant);
}

/**
 * RETIENT les octets d'un document, si la place le permet.
 *
 * ⚠️ ON N'ÉVINCE QUE POUR FAIRE DE LA PLACE, et dans l'ordre où les entrées ont été posées : la carte de
 * JavaScript conserve cet ordre, ce qui suffit ici et évite d'inventer un compteur d'usage.
 */
export function memoriserOctets(cle: string, valeur: Uint8Array, maintenant = Date.now()): void {
  if (valeur.byteLength === 0 || valeur.byteLength > OCTETS_MAX_FICHIER) return;
  octets.delete(cle);
  let total = valeur.byteLength;
  for (const e of octets.values()) total += e.valeur.byteLength;
  for (const [k] of octets) {
    if (total <= OCTETS_MAX_TOTAL) break;
    total -= octets.get(k)?.valeur.byteLength ?? 0;
    octets.delete(k);
  }
  octets.set(cle, { valeur, expireA: maintenant + MEMOIRE_MS });
}

function lire<T>(carte: Map<string, Entree<T>>, cle: string, maintenant: number): T | null {
  const e = carte.get(cle);
  if (e === undefined) return null;
  if (e.expireA <= maintenant) { carte.delete(cle); return null; }
  return e.valeur;
}

/**
 * ⚠️ ON NE MÉMORISE QUE LES RÉUSSITES. Un refus de Google (droits, fichier disparu, réseau) mémorisé pendant une
 * minute ferait échouer une seconde tentative qui, elle, aurait marché — et l'on chercherait la panne chez nous.
 * C'est la même règle que pour le jeton délégué (`driveDelegue`), et elle vient du même raisonnement.
 */
function retenir<T>(carte: Map<string, Entree<T>>, cle: string, valeur: T, maintenant: number): T {
  carte.set(cle, { valeur, expireA: maintenant + MEMOIRE_MS });
  return valeur;
}

/** LES MÉTADONNÉES D'UN ÉLÉMENT, mémorisées le temps d'une rafale. */
export async function metadonneesMemo(
  sujet: string, accessToken: string, id: string, deps: DepsGoogle, maintenant = Date.now(),
): Promise<Resultat<MetaFichier>> {
  const cle = `${sujet}|${id}`;
  const deja = lire(metadonnees, cle, maintenant);
  if (deja !== null) return deja;
  const m = await lireMetadonnees(accessToken, id, deps);
  return m.ok ? retenir(metadonnees, cle, m, maintenant) : m;
}

/**
 * ══ 🔴 LA CHAÎNE DES PARENTS, MÉMORISÉE PAR DOSSIER DE DÉPART. ═══════════════════════════════════════════════════
 *
 * 🔴 LA CLÉ EST LE DOSSIER, PAS LE FICHIER, et c'est tout le gain : les quarante fichiers d'un dossier ont la MÊME
 * chaîne d'ancêtres. La mémoriser une fois les sert tous — y compris le verdict que la LISTE a déjà prononcé en
 * s'affichant, une seconde plus tôt, sur ce même dossier.
 *
 * ⚠️ ON REMONTE DEPUIS LE PARENT, jamais depuis le fichier. La chaîne d'un fichier commence par lui-même, donc ne
 * se partage avec personne : la mémoriser ne servirait qu'à lui.
 */
export async function chaineDuDossierMemo(
  sujet: string, accessToken: string, dossierId: string, deps: DepsGoogle, maintenant = Date.now(),
): Promise<{ id: string; nom: string; parentId: string | null }[]> {
  const cle = `${sujet}|${dossierId}`;
  const deja = lire(chaines, cle, maintenant);
  if (deja !== null) return deja;
  const c = await chaineParents(accessToken, dossierId, deps);
  /**
   * ⚠️ UNE CHAÎNE VIDE OU TRONQUÉE N'EST PAS MÉMORISÉE. Elle signifie « je n'ai pas su remonter », le verdict la
   * traite en refus, et retenir un refus pendant une minute ferait refuser un aperçu parfaitement légitime.
   * Une chaîne COMPLÈTE se reconnaît à son dernier maillon, qui n'a plus de parent.
   */
  const complete = c.length > 0 && c[c.length - 1].parentId === null;
  return complete ? retenir(chaines, cle, c, maintenant) : c;
}
