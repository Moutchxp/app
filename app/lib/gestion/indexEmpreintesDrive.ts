/**
 * ══ 🔴🔴 LOT EMPREINTE-PIECES-DEJA-DANS-LE-DRIVE, NIVEAU 2 — L'INDEX DES EMPREINTES. Module PUR ═══════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * ══ 🔴🔴🔴 LE PRINCIPE, VALIDÉ PAR ARNO LE 03/10/2026 — IL GOUVERNE TOUT CE FICHIER ═══════════════════════════════
 *
 *   ① L'IDENTITÉ D'UN DOCUMENT EST SON EMPREINTE DE CONTENU (md5), JAMAIS SON NOM.
 *   ② CHAQUE COPIE DANS LE DRIVE EST DÉSIGNÉE PAR SON IDENTIFIANT DRIVE.
 *   ③ LES NOMS — celui d'origine comme les suivants — SONT GARDÉS EN HISTORIQUE, pour la RECHERCHE et pour
 *      l'AFFICHAGE. JAMAIS POUR IDENTIFIER.
 *
 * Ce n'est pas une préférence de conception : c'est ce que le cas d'Arno a démontré. Un document parti de notre
 * Drive, renommé, envoyé puis renvoyé revient avec un autre nom et les MÊMES octets. Tout ce qui juge sur le nom
 * se trompe alors deux fois — il ne reconnaît pas ce qui est le même, et il confondrait deux contenus différents
 * portant le même nom. Un nom est une étiquette que l'on change ; une empreinte est ce que le fichier EST.
 *
 * ⚠️ D'OÙ LA DISCIPLINE DE CE MODULE : `nom` est transporté, rangé, affiché — et n'entre dans AUCUNE comparaison
 * d'identité. La seule égalité qui décide est celle de `md5` ; la seule clé est `drive_file_id`.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * RÈGLE D'ARNO (03/10/2026) : « une pièce dont le CONTENU est déjà dans le Drive doit être reconnue, quel que soit
 * son nom. » Le niveau 1 reconnaît ce que l'APPLICATION a rangé ; celui-ci reconnaît ce qu'elle n'a jamais touché.
 *
 * ═══ 🔴🔴 POURQUOI UN INDEX, ET POURQUOI IL N'Y A PAS D'AUTRE VOIE ══════════════════════════════════════════════
 *
 * Parce que GOOGLE NE SAIT PAS CHERCHER PAR EMPREINTE, et c'est MESURÉ, pas supposé : `files.list` avec
 * `q=md5Checksum='4b782aa3…'` répond **HTTP 400 « Invalid Value »** sur le paramètre `q` — sur chacun des 10
 * drives partagés visibles, et avec `corpora=allDrives`. Il n'existe aucune requête « rends-moi les fichiers de
 * cette empreinte ». La seule façon de reconnaître un contenu est donc de connaître d'avance l'empreinte des
 * fichiers. C'est tout l'objet de ce module, et aucune astuce ne l'évite.
 *
 * ═══ 🔒 CE MODULE NE SAIT PAS ÉCRIRE, ET C'EST UNE PROPRIÉTÉ DE SON CODE ════════════════════════════════════════
 *
 * Pas un `fetch`, pas un verbe HTTP, pas une ligne de SQL : il NORMALISE ce qu'une liste Drive a rendu, il TRACE
 * un chemin dans ce que la base sait déjà, et il CHIFFRE un balayage. Un garde statique le vérifie.
 *
 * 🔴🔴 « Documents clients scannés » Y ENTRE EN MÉTADONNÉES, ET SEULEMENT EN MÉTADONNÉES : un nom, un parent, une
 * empreinte. C'est tout ce qu'il faut pour DIRE qu'un document y est déjà rangé, sans jamais en ouvrir le contenu
 * ni y toucher. Le garde d'écriture de l'archive (`driveDeplacement`) reste entier.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Le type MIME d'un dossier Drive. Il n'est pas « une convention » : c'est ainsi que Google désigne un dossier. */
export const MIME_DOSSIER = 'application/vnd.google-apps.folder';

/** Ce qu'une page de `files.list` rend, réduit aux champs que l'index demande. */
export interface EntreeDriveBrute {
  id?: string;
  name?: string;
  md5Checksum?: string;
  parents?: string[];
  driveId?: string;
  mimeType?: string;
  size?: string;
  modifiedTime?: string;
  trashed?: boolean;
}

/** Une ligne prête à ranger. `null` ⇒ l'entrée n'était pas indexable, et la raison est dans `ligneIndexable`. */
export interface LigneIndex {
  driveFileId: string;
  md5: string | null;
  nom: string;
  parentId: string | null;
  driveId: string | null;
  estDossier: boolean;
  typeMime: string | null;
  tailleOctets: number | null;
  modifieLe: string | null;
}

/**
 * ══ 🔴 L'EMPREINTE, NORMALISÉE — ET C'EST LA MÊME DES DEUX CÔTÉS. PUR. ═══════════════════════════════════════════
 *
 * Google rend le md5 en minuscules, mais rien ne le garantit par contrat, et nos propres calculs passent par
 * `digest('hex')`. On normalise donc ici, une fois, et les index SQL portent sur `lower(md5)` pour que la
 * comparaison soit prise par le planificateur plutôt que calculée ligne à ligne.
 *
 * ⚠️ `null` POUR UNE EMPREINTE VIDE, jamais la chaîne vide : une empreinte absente et une empreinte vide ne
 * doivent pas pouvoir s'apparier entre elles. Deux documents Google natifs n'ont pas « le même contenu ».
 */
export function empreinteNormalisee(md5: string | null | undefined): string | null {
  const e = (md5 ?? '').trim().toLowerCase();
  return e === '' ? null : e;
}

/**
 * ══ 🔴🔴 UNE ENTRÉE DE LISTE DEVIENT UNE LIGNE D'INDEX. PUR. ═════════════════════════════════════════════════════
 *
 * ⚠️ UN FICHIER À LA CORBEILLE N'ENTRE PAS : annoncer un emplacement dans la corbeille ferait chercher un
 * document là où personne ne le rangerait. Le balayage filtre déjà `trashed=false`, mais `changes.list` rend les
 * mises à la corbeille — et c'est précisément ce qu'on veut savoir.
 *
 * ⚠️ UNE ENTRÉE SANS IDENTIFIANT OU SANS NOM EST REFUSÉE. Une ligne dont la clé serait vide écraserait la
 * précédente à chaque passage, et une ligne sans nom ne se lit pas à l'écran.
 *
 * 🔴 LE PREMIER PARENT, ET IL N'Y EN A QU'UN : sur les 181 001 fichiers recensés le 03/10/2026, aucun n'en porte
 * plusieurs — Google a retiré les emplacements multiples en 2020. Garder un tableau obligerait chaque lecture à
 * choisir lequel tracer, c'est-à-dire à deviner.
 *
 * ⚠️ LES DOSSIERS SONT INDEXÉS AUSSI, et pas par symétrie : tracer le chemin d'un fichier demande de remonter ses
 * parents, et les remonter chez Google coûterait un appel par niveau. Avec les dossiers dans la table, le chemin
 * se reconstitue EN BASE.
 */
export function ligneIndexable(f: EntreeDriveBrute, driveIdParDefaut: string | null = null): LigneIndex | null {
  const id = (f.id ?? '').trim();
  const nom = (f.name ?? '').trim();
  if (id === '' || nom === '') return null;
  if (f.trashed === true) return null;
  const taille = Number(f.size ?? '');
  return {
    driveFileId: id,
    md5: empreinteNormalisee(f.md5Checksum),
    nom,
    parentId: (f.parents ?? [])[0]?.trim() ?? null,
    /* ⚠️ `driveId` ABSENT ⇒ « Mon Drive » du compte qui relève : Google ne le nomme que pour un drive partagé. */
    driveId: (f.driveId ?? '').trim() === '' ? driveIdParDefaut : (f.driveId ?? '').trim(),
    estDossier: f.mimeType === MIME_DOSSIER,
    typeMime: (f.mimeType ?? '').trim() === '' ? null : (f.mimeType ?? '').trim(),
    tailleOctets: Number.isSafeInteger(taille) && taille >= 0 ? taille : null,
    modifieLe: (f.modifiedTime ?? '').trim() === '' ? null : (f.modifiedTime ?? '').trim(),
  };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 L'ALIMENTATION GRATUITE : CHAQUE DOSSIER QUE LA FENÊTRE OUVRE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Une ligne telle que la fenêtre la reçoit déjà (`FichierDrive` de `drive.ts`), réduite à ce qui nous sert. */
export interface EntreeAffichee {
  id: string;
  nom: string;
  driveId?: string | null;
  typeMime?: string;
  tailleOctets?: number | null;
  modifieLe?: string | null;
  dossier?: boolean;
  parentId?: string | null;
  md5?: string | null;
}

/**
 * ══ 🔴🔴 CE QU'ON A LE DROIT DE RANGER DEPUIS UN DOSSIER OUVERT. PUR. ═══════════════════════════════════════════
 *
 * C'est l'alimentation la plus précieuse de l'index : l'empreinte voyage avec chaque ligne, dans le MÊME appel
 * que les noms, donc gratuitement — et elle couvre exactement les endroits où l'on travaille.
 *
 * 🔴🔴 MAIS ELLE A UN PIÈGE, ET IL FAUT L'ÉCRIRE. La fenêtre SUIT LES RACCOURCIS : pour un raccourci, `id` est
 * celui de la CIBLE, tandis que `md5` est celui du raccourci — c'est-à-dire presque toujours `null` (Google ne
 * nous donne pas l'empreinte de la cible ici). Ranger cette ligne telle quelle écraserait l'empreinte VÉRITABLE
 * de la cible par un `null`, et l'on perdrait un fichier qu'on connaissait déjà.
 *
 * LA RÈGLE EST DONC : un FICHIER n'entre que s'il porte une empreinte ; un DOSSIER entre toujours (il n'en a
 * jamais, et c'est lui qui permet de tracer les chemins en base). Un document Google natif reste donc hors de
 * l'index par cette voie — il n'a pas d'empreinte, il n'est pas reconnaissable par son contenu, et le balayage
 * de fond, qui ne suit pas les raccourcis, l'y mettra pour les chemins.
 */
export function ligneDepuisEntreeAffichee(f: EntreeAffichee, parentParDefaut: string | null): LigneIndex | null {
  const id = (f.id ?? '').trim();
  const nom = (f.nom ?? '').trim();
  if (id === '' || nom === '') return null;
  const estDossier = f.dossier === true || f.typeMime === MIME_DOSSIER;
  const md5 = empreinteNormalisee(f.md5);
  if (!estDossier && md5 === null) return null;          // voir l'encadré : le piège du raccourci
  const taille = f.tailleOctets ?? null;
  return {
    driveFileId: id,
    md5,
    nom,
    parentId: (f.parentId ?? '').trim() === '' ? parentParDefaut : (f.parentId ?? '').trim(),
    driveId: (f.driveId ?? '') === '' ? null : f.driveId ?? null,
    estDossier,
    typeMime: (f.typeMime ?? '').trim() === '' ? null : (f.typeMime ?? '').trim(),
    tailleOctets: taille !== null && Number.isSafeInteger(taille) && taille >= 0 ? taille : null,
    modifieLe: (f.modifieLe ?? '') === '' ? null : f.modifieLe ?? null,
  };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LE CHEMIN, RECONSTITUÉ EN BASE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** La borne de remontée : au-delà, c'est une table abîmée par un cycle, pas une arborescence. */
export const NIVEAUX_MAX = 32;

/**
 * ══ 🔴🔴 LE CHEMIN D'UN FICHIER, DU PARENT IMMÉDIAT À LA RACINE. PUR. ═══════════════════════════════════════════
 *
 * `noeuds` est ce que la base sait : identifiant → { nom, parent }. On remonte, et l'on s'arrête dès qu'un parent
 * manque — parce qu'un chemin incomplet se lit (« …, Biens, Racine » amputé de son sommet) alors qu'un chemin
 * deviné ne se lit pas.
 *
 * ⚠️ BORNÉE **ET** SANS CYCLE : un identifiant déjà vu arrête la remontée. Une table abîmée ne doit pas figer la
 * fenêtre — et la fenêtre, elle, doit répondre tout de suite.
 */
export function cheminDepuisIndex(
  depart: string | null,
  noeuds: ReadonlyMap<string, { nom: string; parentId: string | null }>,
): { id: string; nom: string }[] {
  const out: { id: string; nom: string }[] = [];
  const vus = new Set<string>();
  let courant = (depart ?? '').trim() === '' ? null : (depart ?? '').trim();
  for (let i = 0; i < NIVEAUX_MAX && courant !== null && !vus.has(courant); i += 1) {
    vus.add(courant);
    const n = noeuds.get(courant);
    if (n === undefined) break;
    out.push({ id: courant, nom: n.nom });
    courant = (n.parentId ?? '').trim() === '' ? null : (n.parentId ?? '').trim();
  }
  return out;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 CE QUE LE BALAYAGE COÛTE — LES CHIFFRES QU'ARNO A DEMANDÉS AVANT DE DÉCIDER
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ LA TAILLE DE PAGE EST CELLE DU MAXIMUM DE L'API. Mille entrées par appel : c'est ce qui ramène un balayage de
 * 202 000 entrées à 209 appels. Une page de 100 (le défaut de l'API) en aurait demandé plus de deux mille.
 */
export const TAILLE_PAGE_INDEX = 1000;

/** Un corpus mesuré : un drive partagé, ou « Mon Drive ». */
export interface MesureCorpus {
  nom: string;
  fichiers: number;
  dossiers: number;
  pages: number;
  dureeMs: number;
}

export interface Chiffrage {
  fichiers: number;
  dossiers: number;
  entrees: number;
  /** Les appels `files.list` que le balayage émet : c'est l'unité du quota Drive, pas le nombre de fichiers. */
  appels: number;
  dureeMs: number;
}

/**
 * ══ 🔴🔴 LE CHIFFRAGE D'UN BALAYAGE COMPLET. PUR. ════════════════════════════════════════════════════════════════
 *
 * Arno : « AVANT de lancer le balayage complet : compte les fichiers par drive (estimation), la durée et le quota
 * estimés. Arrête-toi et demande à Arno avec ces chiffres. »
 *
 * 🔴 CE N'EST PAS UNE ESTIMATION PAR EXTRAPOLATION, ET C'EST MIEUX : les corpus ont été ÉNUMÉRÉS pour de vrai, en
 * métadonnées minimales (`files(id,mimeType)`), le 03/10/2026. Les chiffres rendus ici sont donc MESURÉS. Un
 * balayage d'indexation demande les mêmes pages avec quelques champs de plus : le nombre d'appels est identique,
 * la durée du même ordre, à la charge du réseau près.
 */
export function chiffrageBalayage(mesures: readonly MesureCorpus[]): Chiffrage {
  let fichiers = 0; let dossiers = 0; let appels = 0; let dureeMs = 0;
  for (const m of mesures) {
    fichiers += Math.max(0, m.fichiers);
    dossiers += Math.max(0, m.dossiers);
    appels += Math.max(0, m.pages);
    dureeMs += Math.max(0, m.dureeMs);
  }
  return { fichiers, dossiers, entrees: fichiers + dossiers, appels, dureeMs };
}

/** Une durée en millisecondes, dite comme on la dirait à l'oral. PUR. */
export function motDuree(ms: number): string {
  const s = Math.round(Math.max(0, ms) / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const reste = s % 60;
  return reste === 0 ? `${m} min` : `${m} min ${reste} s`;
}

/**
 * LA PHRASE QUI DIT CE QUE COÛTERAIT LE BALAYAGE. PUR.
 *
 * ⚠️ LE QUOTA SE COMPTE EN REQUÊTES, PAS EN FICHIERS, et c'est tout l'intérêt des pages de mille : 209 appels
 * étalés sur six minutes, là où un appel par fichier en aurait demandé 181 001. On DIT les deux nombres, parce
 * que c'est leur écart qui répond à la question « est-ce que ça passe ? ».
 */
export function motChiffrage(c: Chiffrage): string {
  return `${c.entrees.toLocaleString('fr-FR')} entrées à relever `
    + `(${c.fichiers.toLocaleString('fr-FR')} fichiers, ${c.dossiers.toLocaleString('fr-FR')} dossiers), `
    + `en ${c.appels.toLocaleString('fr-FR')} appels files.list de ${TAILLE_PAGE_INDEX} entrées, `
    + `soit environ ${motDuree(c.dureeMs)}.`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LES MOTS DE L'ÉCRAN
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * CE QUE L'INDEX SAIT, ET DEPUIS QUAND. PUR.
 *
 * 🔴 LA DATE N'EST PAS UN ORNEMENT. Un index est un reflet : sans sa date, on ne saurait pas si « aucun autre
 * emplacement » veut dire « nulle part ailleurs » ou « nulle part ailleurs il y a trois mois ». Et même daté, il
 * ne permet jamais de promettre l'exhaustivité — c'est pourquoi le compteur dit toujours « connus ».
 */
export function motEtatIndex(o: { fichiers: number; releveLe: Date | null }): string {
  if (o.fichiers <= 0) return 'Aucune empreinte du Drive n’est indexée.';
  const quand = o.releveLe === null
    ? 'à une date inconnue'
    : `au ${o.releveLe.toLocaleDateString('fr-FR')} ${o.releveLe.toLocaleTimeString('fr-FR').slice(0, 5)}`;
  return `${o.fichiers.toLocaleString('fr-FR')} empreinte${o.fichiers > 1 ? 's' : ''} du Drive indexée`
    + `${o.fichiers > 1 ? 's' : ''}, relevé ${quand}.`;
}
