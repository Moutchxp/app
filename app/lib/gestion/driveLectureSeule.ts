/**
 * ══ 🔴🔴 LOT TACHES-PIECES-DRIVE — LE DRIVE EN LECTURE SEULE STRICTE, VERROUILLÉ DANS LE CODE ════════════════════════
 *
 * RÈGLE ABSOLUE D'ARNO (13/10/2026) pour les pièces jointes des tâches : « Lecture seule stricte : lister, chercher,
 * lire les métadonnées. AUCUNE écriture, création, renommage, déplacement, partage, suppression ni mise à la
 * corbeille, nulle part. » Et « Documents clients scannés » n'est jamais modifié.
 *
 * 🔴 LA RÈGLE N'EST PAS UNE DISCIPLINE, C'EST UN VERROU : toutes les lectures Drive des tâches passent par
 * `fetchDriveLectureSeule`, qui REFUSE (exception, avant tout envoi) :
 *   · toute méthode autre que GET (POST, PATCH, PUT, DELETE… — créer, renommer, déplacer, partager, corbeille) ;
 *   · toute adresse hors de l'API de lecture du Drive (`https://www.googleapis.com/drive/v3/…`), dont l'adresse
 *     d'envoi de fichiers (`/upload/…`) et toute autre API Google ;
 *   · les sous-ressources d'écriture même en GET (`/permissions`, `/watch`, `/copy`, `/emptyTrash`, `/generateIds`).
 * Les fonctions de `drive.ts` reçoivent leur `fetch` en paramètre : on leur passe celui-ci, et elles ne PEUVENT plus
 * écrire, quoi qu'elles contiennent.
 *
 * PUR (aucune base). Le `fetch` sous-jacent est injecté.
 */

export class EcritureDriveRefusee extends Error {
  constructor(motif: string) {
    super(`Drive en lecture seule (tâches) : ${motif}`);
    this.name = 'EcritureDriveRefusee';
  }
}

const BASE_LECTURE = 'https://www.googleapis.com/drive/v3/';
const SOUS_RESSOURCES_INTERDITES = /\/(permissions|watch|copy|emptyTrash|generateIds|revisions|comments|replies)(\/|$|\?)/i;

/** La requête est-elle une LECTURE de l'API Drive ? `null` si oui, sinon la raison du refus. PUR. */
export function refusEcritureDrive(url: string, methode: string | undefined): string | null {
  const m = (methode ?? 'GET').toUpperCase();
  if (m !== 'GET') return `méthode ${m} refusée`;
  if (!url.startsWith(BASE_LECTURE)) return 'adresse hors de l’API de lecture du Drive';
  const chemin = url.slice(BASE_LECTURE.length);
  if (!/^(files|drives)(\/|\?|$)/.test(chemin)) return 'ressource Drive non permise';
  if (SOUS_RESSOURCES_INTERDITES.test(`/${chemin}`)) return 'sous-ressource d’écriture refusée';
  return null;
}

/** Le `fetch` des tâches : celui du serveur, mais qui ne laisse passer QUE des lectures du Drive. */
export function fetchDriveLectureSeule(base: typeof fetch = fetch): typeof fetch {
  return (async (entree: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof entree === 'string' ? entree : entree instanceof URL ? entree.toString() : entree.url;
    const methode = init?.method ?? (typeof entree === 'object' && 'method' in entree ? entree.method : 'GET');
    const refus = refusEcritureDrive(url, methode);
    if (refus !== null) throw new EcritureDriveRefusee(refus);
    return base(entree, init);
  }) as typeof fetch;
}
