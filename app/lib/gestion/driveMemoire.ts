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

/** Pour les tests, et pour une passe qui voudrait repartir à neuf. Sans effet sur le Drive. */
export function oublierLeDrive(): void {
  metadonnees.clear();
  chaines.clear();
}

/** Combien d'entrées sont retenues. Sert aux mesures et aux tests — jamais à l'écran. */
export function tailleMemoire(): { metadonnees: number; chaines: number } {
  return { metadonnees: metadonnees.size, chaines: chaines.size };
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
