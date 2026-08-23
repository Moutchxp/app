/**
 * FRAÎCHEUR DES DONNÉES — modèle PUR de l'écran « Sources de données » (lot 1/3, LECTURE SEULE).
 *
 * Ce module ne lit NI base NI réseau : il reçoit des `LectureSource[]` (relevés bruts produits par le repo)
 * et un `maintenant`, et en dérive les lignes affichables. But : rendre visible ce qui est aujourd'hui
 * invisible — quel millésime on a par source, son âge, si on la surveille, comment on la ré-ingère, et où
 * (par département) elle couvre le territoire.
 *
 * RÈGLES D'HONNÊTETÉ CODÉES ICI (non négociables) :
 *  - une source SANS millésime (LiDAR, adresse, BDNB) affiche « millésime inconnu » / un SUBSTITUT NOMMÉ
 *    (date max d'une colonne, nombre d'objets), jamais un substitut déguisé en millésime ;
 *  - l'âge est CALCULÉ à partir d'une date de référence réelle ; sans date de référence → « inconnu »,
 *    jamais « à jour » (on ne sait pas si une édition plus récente existe) ;
 *  - une source vide le DIT explicitement (aucun compte à zéro muet).
 */

/** Départements du périmètre (ordre stable, affiché tel quel dans la grille de couverture). */
export const DEPARTEMENTS = ['75', '77', '78', '91', '92', '93', '94', '95'] as const;
export type Departement = (typeof DEPARTEMENTS)[number];

/** État de couverture d'une source spatiale sur un département donné. */
export type Couverture = 'present' | 'partiel' | 'absent';

/** Mode de ré-ingestion d'une source (avec la commande exacte quand elle existe). */
export type Reingestion =
  | { mode: 'automatique'; commande: string }
  | { mode: 'manuelle'; commande: string }
  | { mode: 'inexistante' };

/** Métadonnées FIXES d'une source (ce qui ne se lit pas en base : rôle, surveillance, mode de ré-ingestion). */
export interface MetaSource {
  cle: string;
  nom: string;
  /** Ce à quoi elle sert, en une ligne, en clair. */
  sert: string;
  /** Surveille-t-on l'apparition d'un nouveau millésime ? (aujourd'hui : Sitadel seul.) */
  surveillance: boolean;
  reingestion: Reingestion;
  /** Source géométrique → on affiche sa couverture par département. */
  spatial: boolean;
  /** Existe-t-il un moyen technique de détecter une édition plus récente SANS télécharger la donnée ? (lot 2) */
  detectable: boolean;
  /** Si `detectable` est false : pourquoi, en une ligne (affiché tel quel). */
  motifNonDetectable?: string;
}

/** Relevé BRUT d'une source, produit par le repo (aucune mise en forme, aucun calcul d'âge). */
export interface LectureSource {
  cle: string;
  /** Vrai millésime en base (ex. « 2026-06-15 »), ou null s'il n'y en a pas. */
  millesime: string | null;
  /** Substitut NOMMÉ affiché à la place d'un millésime absent (ex. « dernière modification : 2026-03-20 »). */
  substitut: string | null;
  /** Date de référence (ISO « YYYY-MM-DD ») pour calculer l'âge ; null → âge inconnu. */
  dateReference: string | null;
  /** Aucune donnée en base pour cette source. */
  vide: boolean;
  /** Lecture impossible (table absente / requête en échec) — distinct de « vide ». */
  indisponible?: boolean;
  /** Nombre d'objets par département (sources spatiales) → présent si > 0. */
  comptesParDept?: Partial<Record<Departement, number>>;
  /** Départements explicitement PARTIELS (ex. LiDAR : bbox 1 km² dans le 92). */
  partielsParDept?: Departement[];
}

/** Ligne affichable : métadonnées + relevé mis en forme (millésime affiché, âge calculé, couverture). */
export interface LigneSource extends MetaSource {
  /** Texte du millésime OU du substitut OU « aucune donnée » — jamais trompeur. */
  millesimeAffiche: string;
  /** true → `millesimeAffiche` est un substitut, pas un millésime. */
  estSubstitut: boolean;
  /** Âge en jours de la date de référence ; null → inconnu (aucune date fiable). */
  ageJours: number | null;
  vide: boolean;
  indisponible: boolean;
  /** Couverture par département (uniquement si `spatial`). */
  couverture?: Record<Departement, Couverture>;
  /** État de détection d'une édition plus récente (lot 2) — présent dès qu'on fournit les relevés de détection. */
  detection?: EtatDetection;
}

/**
 * Relevé BRUT de la DERNIÈRE détection d'une source (lot 2), produit par le repo depuis `source_detection` (ou, pour
 * Sitadel, depuis `veille_run`). `verifieLe`/`dernierSuccesLe` sont des dates ISO ; null = jamais.
 */
export interface LectureDetection {
  source: string;
  /** La surveillance de cette source est-elle activée ? (réglage par source) */
  actif: boolean;
  /** Dernière TENTATIVE de vérification (ISO), ou null si jamais. */
  verifieLe: string | null;
  /** La dernière tentative a-t-elle réussi ? null si jamais tentée. */
  succes: boolean | null;
  /** Dernière tentative RÉUSSIE (ISO) — sert au « échec depuis N jours ». */
  dernierSuccesLe: string | null;
  /** Édition/millésime trouvé à distance (ex. « 2026-06-15 »). */
  editionDistante: string | null;
  /** Date de cette édition (ISO) — comparée à ce qu'on détient. */
  dateDistante: string | null;
  /** Message d'échec de la dernière tentative. */
  motif: string | null;
}

/**
 * État de détection AFFICHABLE. Règle d'honnêteté du lot 1 appliquée à la détection : un échec n'est JAMAIS « à jour »,
 * c'est un aveu d'ignorance daté ; une source non détectable le dit avec son motif.
 */
export type EtatDetection =
  | { statut: 'a_jour'; verifieLe: string | null }
  | { statut: 'mise_a_jour'; editionDistante: string; verifieLe: string | null }
  | { statut: 'non_verifiable'; motif: string }
  | { statut: 'echec'; depuisJours: number | null }
  | { statut: 'jamais_verifie' }
  | { statut: 'desactive' };

/** Normalise une date « YYYY-MM » ou « YYYY-MM-DD » en millisecondes UTC, ou null si illisible. */
function dateEnMs(d: string | null): number | null {
  if (!d) return null;
  const iso = /^\d{4}-\d{2}$/.test(d) ? `${d}-01` : d.slice(0, 10);
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isNaN(t) ? null : t;
}

/**
 * Calcule l'état de détection d'une source à partir de : ses métadonnées (détectable ou non), la date locale de ce
 * qu'on détient, le dernier relevé de détection, et « maintenant ». PUR.
 */
export function etatDetection(meta: MetaSource, dateLocale: string | null, det: LectureDetection | undefined, maintenant: Date): EtatDetection {
  if (!meta.detectable) return { statut: 'non_verifiable', motif: meta.motifNonDetectable ?? 'aucun mécanisme de détection' };
  if (det && det.actif === false) return { statut: 'desactive' };
  if (!det || det.verifieLe === null) return { statut: 'jamais_verifie' };
  if (det.succes === false) {
    // Échec : JAMAIS « à jour ». On date l'ignorance depuis le dernier succès (ou depuis la 1re tentative si aucun succès).
    const base = det.dernierSuccesLe ?? det.verifieLe;
    return { statut: 'echec', depuisJours: ageEnJours(base ? base.slice(0, 10) : null, maintenant) };
  }
  const dd = dateEnMs(det.dateDistante);
  const dl = dateEnMs(dateLocale);
  // Date de la dernière vérification RÉUSSIE (pour l'afficher : « vérifiée le … »). Repli sur la dernière tentative.
  const verifieLe = det.dernierSuccesLe ?? det.verifieLe ?? null;
  if (dd !== null && dl !== null && dd > dl) return { statut: 'mise_a_jour', editionDistante: det.editionDistante ?? '(édition inconnue)', verifieLe };
  return { statut: 'a_jour', verifieLe };
}

/**
 * CATALOGUE — l'ordre d'affichage IMPOSÉ (LiDAR en tête : seule source qui entre dans le verdict), et pour
 * chaque source ce qui ne se lit pas en base. Une source ABSENTE des relevés reste affichée (indisponible).
 */
export const CATALOGUE: readonly MetaSource[] = [
  {
    cle: 'lidar',
    nom: 'LiDAR HD',
    sert: 'Altitudes du terrain et des toits — la seule source qui entre dans le verdict.',
    surveillance: false,
    reingestion: { mode: 'inexistante' },
    spatial: true,
    detectable: false,
    motifNonDetectable: 'aucun millésime gravé, et l’IGN diffuse le LiDAR HD par blocs à passage unique (pas d’éditions datées) — rien à comparer.',
  },
  {
    cle: 'bdtopo_bati',
    nom: 'BD TOPO® bâtiment',
    sert: 'Emprises et hauteurs des bâtiments (détecteur de changement).',
    surveillance: false,
    reingestion: { mode: 'manuelle', commande: 'npm run bdtopo:import' },
    spatial: true,
    detectable: true,
  },
  {
    cle: 'bdtopo_adresse',
    nom: 'BD TOPO® adresse',
    sert: 'Géocodage des adresses saisies.',
    surveillance: false,
    reingestion: { mode: 'inexistante' },
    spatial: true,
    detectable: true,
  },
  {
    cle: 'cadastre',
    nom: 'Cadastre',
    sert: 'Parcelles — rattachement des permis au bâti.',
    surveillance: false,
    reingestion: { mode: 'manuelle', commande: 'npm run cadastre:ingest' },
    spatial: true,
    detectable: true,
  },
  {
    cle: 'sitadel',
    nom: 'Sitadel',
    sert: 'Permis de construire — veille des autorisations d’urbanisme.',
    surveillance: true,
    reingestion: { mode: 'automatique', commande: 'npm run veille:run' },
    spatial: true,
    detectable: true,
  },
  {
    cle: 'dila',
    nom: 'DILA',
    sert: 'Coordonnées des mairies — envoi des demandes.',
    surveillance: false,
    reingestion: { mode: 'manuelle', commande: 'npm run dila:ingest' },
    spatial: false,
    detectable: true,
  },
  {
    cle: 'prada',
    nom: 'PRADA',
    sert: 'Responsables d’accès aux documents — recours CADA.',
    surveillance: false,
    reingestion: { mode: 'manuelle', commande: 'npm run prada:ingest' },
    spatial: false,
    detectable: true,
  },
  {
    cle: 'bdnb',
    nom: 'BDNB',
    sert: 'Année de construction — pivot et barème par époque.',
    surveillance: false,
    reingestion: { mode: 'inexistante' },
    spatial: false,
    detectable: false,
    motifNonDetectable: 'aucun millésime importé en base (seule l’année de construction l’a été) — rien à comparer.',
  },
] as const;

const JOUR_MS = 86_400_000;

/** Âge en jours entiers d'une date « YYYY-MM-DD » à `maintenant`, ou null si la date est absente / illisible. */
export function ageEnJours(dateReference: string | null, maintenant: Date): number | null {
  if (!dateReference) return null;
  const t = Date.parse(`${dateReference}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  return Math.floor((maintenant.getTime() - t) / JOUR_MS);
}

/** Texte de la ré-ingestion (avec la commande exacte). « inexistante » → formule d'honnêteté explicite. */
export function texteReingestion(r: Reingestion): string {
  if (r.mode === 'automatique') return `automatique · ${r.commande}`;
  if (r.mode === 'manuelle') return `manuelle · ${r.commande}`;
  return 'aucune procédure de réingestion';
}

/** Classe la couverture d'une source spatiale : partiel explicite > présent (compte > 0) > absent. */
function classerCouverture(lu: LectureSource | undefined): Record<Departement, Couverture> {
  const partiels = new Set(lu?.partielsParDept ?? []);
  const comptes = lu?.comptesParDept ?? {};
  const out = {} as Record<Departement, Couverture>;
  for (const d of DEPARTEMENTS) {
    if (partiels.has(d)) out[d] = 'partiel';
    else if ((comptes[d] ?? 0) > 0) out[d] = 'present';
    else out[d] = 'absent';
  }
  return out;
}

/**
 * Construit les lignes affichables dans l'ORDRE du catalogue. PUR : aucune I/O.
 * `maintenant` est injecté (l'âge est calculé, jamais codé en dur).
 */
export function construireEtatSources(lectures: LectureSource[], maintenant: Date, detections: LectureDetection[] = []): LigneSource[] {
  const parCle = new Map(lectures.map((l) => [l.cle, l]));
  const detParCle = new Map(detections.map((d) => [d.source, d]));
  return CATALOGUE.map((meta) => {
    const lu = parCle.get(meta.cle);
    const indisponible = lu?.indisponible === true;
    const vide = !lu || lu.vide;

    let millesimeAffiche: string;
    let estSubstitut = false;
    if (indisponible) {
      millesimeAffiche = 'lecture indisponible';
    } else if (vide) {
      millesimeAffiche = 'aucune donnée en base';
    } else if (lu!.millesime) {
      millesimeAffiche = lu!.millesime;
    } else {
      // Pas de millésime : on affiche le substitut NOMMÉ (jamais déguisé en millésime).
      millesimeAffiche = lu!.substitut ?? 'millésime inconnu';
      estSubstitut = true;
    }

    const ageJours = indisponible || vide ? null : ageEnJours(lu!.dateReference, maintenant);

    return {
      ...meta,
      millesimeAffiche,
      estSubstitut,
      ageJours,
      vide,
      indisponible,
      couverture: meta.spatial ? classerCouverture(indisponible ? undefined : lu) : undefined,
      detection: etatDetection(meta, lu?.dateReference ?? null, detParCle.get(meta.cle), maintenant),
    };
  });
}

/** Résumé de couverture pour la ligne de contexte : départements où le verdict (LiDAR) et le bâti sont disponibles. */
export interface ResumeCouverture {
  departementsLidar: Departement[];
  departementsBati: Departement[];
}

/** Extrait les départements couverts (présent OU partiel) par le LiDAR et par la BD TOPO bâtiment. */
export function resumeCouverture(lignes: LigneSource[]): ResumeCouverture {
  const couverts = (cle: string): Departement[] => {
    const c = lignes.find((l) => l.cle === cle)?.couverture;
    if (!c) return [];
    return DEPARTEMENTS.filter((d) => c[d] !== 'absent');
  };
  return { departementsLidar: couverts('lidar'), departementsBati: couverts('bdtopo_bati') };
}
