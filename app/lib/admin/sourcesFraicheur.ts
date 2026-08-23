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
  },
  {
    cle: 'bdtopo_bati',
    nom: 'BD TOPO® bâtiment',
    sert: 'Emprises et hauteurs des bâtiments (détecteur de changement).',
    surveillance: false,
    reingestion: { mode: 'manuelle', commande: 'npm run bdtopo:import' },
    spatial: true,
  },
  {
    cle: 'bdtopo_adresse',
    nom: 'BD TOPO® adresse',
    sert: 'Géocodage des adresses saisies.',
    surveillance: false,
    reingestion: { mode: 'inexistante' },
    spatial: true,
  },
  {
    cle: 'cadastre',
    nom: 'Cadastre',
    sert: 'Parcelles — rattachement des permis au bâti.',
    surveillance: false,
    reingestion: { mode: 'manuelle', commande: 'npm run cadastre:ingest' },
    spatial: true,
  },
  {
    cle: 'sitadel',
    nom: 'Sitadel',
    sert: 'Permis de construire — veille des autorisations d’urbanisme.',
    surveillance: true,
    reingestion: { mode: 'automatique', commande: 'npm run veille:run' },
    spatial: true,
  },
  {
    cle: 'dila',
    nom: 'DILA',
    sert: 'Coordonnées des mairies — envoi des demandes.',
    surveillance: false,
    reingestion: { mode: 'manuelle', commande: 'npm run dila:ingest' },
    spatial: false,
  },
  {
    cle: 'prada',
    nom: 'PRADA',
    sert: 'Responsables d’accès aux documents — recours CADA.',
    surveillance: false,
    reingestion: { mode: 'manuelle', commande: 'npm run prada:ingest' },
    spatial: false,
  },
  {
    cle: 'bdnb',
    nom: 'BDNB',
    sert: 'Année de construction — pivot et barème par époque.',
    surveillance: false,
    reingestion: { mode: 'inexistante' },
    spatial: false,
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
export function construireEtatSources(lectures: LectureSource[], maintenant: Date): LigneSource[] {
  const parCle = new Map(lectures.map((l) => [l.cle, l]));
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
