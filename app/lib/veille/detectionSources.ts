import { extraireLienCsv, millesimeDepuisNomFichier } from '../sitadel/prada';

/**
 * FRAÎCHEUR lot 2/3 — DÉTECTION des nouvelles publications par MÉTADONNÉES SEULES. Sur le patron de `millesimeDistantDido`
 * (Sitadel) : on interroge un index / un en-tête / une page (quelques Ko), on en déduit l'édition la plus récente PUBLIÉE, et
 * on NE TÉLÉCHARGE JAMAIS la donnée (les .7z, .zip, .csv, .tar.bz2 restent le lot 3). Chaque source est ISOLÉE : l'échec de
 * l'une n'empêche pas les autres. Toutes les I/O sont injectables (`DepsDetection`) → testable sans réseau ni base.
 *
 * URLs VÉRIFIÉES en session (23/08/2026) :
 *  - BD TOPO (bâtiment ET adresse, même paquet TOUSTHEMES) : index Atom de diffusion IGN Géoplateforme, filtré GPKG + D092
 *    (~17 Ko) → dernière édition « _D092_YYYY-MM-DD ».
 *  - Cadastre : listing du dossier etalab-cadastre (~quelques Ko) → dernier millésime « YYYY-MM-DD/ ».
 *  - DILA : requête HEAD sur le fichier all_latest → en-tête « Last-Modified » (0 octet de corps).
 *  - PRADA : page de l'annuaire CADA (~18 Ko) → lien .csv → millésime « annuaire_MM_AA.csv ».
 *  - LiDAR & BDNB : NON détectables (voir `motifNonDetectable` du catalogue) — jamais interrogées ici.
 *  - Sitadel : déjà surveillée par son propre mécanisme — on l'AFFICHE (lu depuis `veille_run`), on ne la re-sonde pas ici.
 */

/** Index Atom de diffusion IGN, filtré au produit BD TOPO GPKG / département 92 (l'index complet fait 3833 entrées → on filtre). */
export const URL_BDTOPO = 'https://data.geopf.fr/telechargement/resource/BDTOPO?format=GPKG&zone=D092';
/** Listing du dossier des millésimes etalab-cadastre (dossiers datés « YYYY-MM-DD/ »). */
export const URL_CADASTRE = 'https://cadastre.data.gouv.fr/data/etalab-cadastre/';
/** Page de l'annuaire CADA des PRADA (porte le lien .csv daté). */
export const URL_PRADA = 'https://www.cada.fr/lacada/annuaire-des-prada';

/** Les sources RÉELLEMENT sondées (LiDAR/BDNB non détectables ; Sitadel affichée depuis son propre mécanisme). */
export const SOURCES_PROBEES = ['bdtopo_bati', 'bdtopo_adresse', 'cadastre', 'dila', 'prada'] as const;
export type SourceProbee = (typeof SOURCES_PROBEES)[number];

/** Édition distante trouvée par un détecteur. */
export interface EditionDistante {
  editionDistante: string | null;
  dateDistante: string | null; // ISO « YYYY-MM-DD » (ou « YYYY-MM-01 » pour un millésime mensuel)
}

/** Résultat persisté d'une tentative de détection. */
export interface ResultatDetection {
  succes: boolean;
  editionDistante: string | null;
  dateDistante: string | null;
  motif: string | null;
}

/** Toutes les I/O de la détection, injectables pour les tests (aucun réseau, aucune base). */
export interface DepsDetection {
  maintenant(): Date;
  config(): Promise<{ active: boolean; intervalleHeures: number }>;
  etats(): Promise<Map<string, { actif: boolean; verifieLe: Date | null }>>;
  enregistrer(source: string, r: ResultatDetection, maintenant: Date): Promise<void>;
  /** GET texte d'une page/index de MÉTADONNÉES (jamais un fichier de donnée). */
  lireTexte(url: string): Promise<string>;
  /** HEAD d'un fichier → en-tête Last-Modified (aucun corps téléchargé). */
  lireEntete(url: string): Promise<{ lastModified: string | null }>;
  /** URL DILA effective (base → env → défaut) ; injectée pour ne pas dépendre de la config ici. */
  urlDila(): Promise<string>;
}

/** Résumé d'un passage de détection (pour le journal / les tests). */
export interface ResumeDetection {
  active: boolean;
  verifiees: string[];
  ignorees: string[];
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Max lexicographique d'une liste de dates ISO « YYYY-MM-DD » (l'ordre lexical = l'ordre chronologique). null si vide. */
export function maxDateIso(dates: string[]): string | null {
  let max: string | null = null;
  for (const d of dates) if (max === null || d > max) max = d;
  return max;
}

/** BD TOPO (bâtiment ET adresse) : dernière édition GPKG D092 de l'index IGN. */
export async function detecterBdtopo(deps: DepsDetection): Promise<EditionDistante> {
  const html = await deps.lireTexte(URL_BDTOPO);
  const dates = [...html.matchAll(/_D092_(\d{4}-\d{2}-\d{2})/g)].map((m) => m[1]);
  const max = maxDateIso(dates);
  if (!max) throw new Error('BD TOPO : aucune édition GPKG D092 trouvée dans l’index de diffusion IGN');
  return { editionDistante: max, dateDistante: max };
}

/** Cadastre : dernier millésime daté du listing etalab-cadastre. */
export async function detecterCadastre(deps: DepsDetection): Promise<EditionDistante> {
  const html = await deps.lireTexte(URL_CADASTRE);
  const dates = [...html.matchAll(/etalab-cadastre\/(\d{4}-\d{2}-\d{2})\//g)].map((m) => m[1]);
  const max = maxDateIso(dates);
  if (!max) throw new Error('Cadastre : aucun millésime daté trouvé dans le listing etalab-cadastre');
  return { editionDistante: max, dateDistante: max };
}

/** DILA : date du fichier all_latest via l'en-tête Last-Modified (HEAD, aucun corps). */
export async function detecterDila(deps: DepsDetection): Promise<EditionDistante> {
  const url = await deps.urlDila();
  const { lastModified } = await deps.lireEntete(url);
  if (!lastModified) throw new Error('DILA : en-tête « Last-Modified » absent sur le fichier all_latest');
  const t = Date.parse(lastModified);
  if (Number.isNaN(t)) throw new Error(`DILA : « Last-Modified » illisible (${lastModified})`);
  const iso = new Date(t).toISOString().slice(0, 10);
  return { editionDistante: iso, dateDistante: iso };
}

/** PRADA : millésime du .csv lié sur la page de l'annuaire CADA (aucun téléchargement du CSV). */
export async function detecterPrada(deps: DepsDetection): Promise<EditionDistante> {
  const html = await deps.lireTexte(URL_PRADA);
  const url = extraireLienCsv(html, URL_PRADA);
  const nom = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() ?? '');
  const millesime = millesimeDepuisNomFichier(nom); // « YYYY-MM »
  return { editionDistante: millesime, dateDistante: `${millesime}-01` };
}

/** Aiguille une source vers son détecteur. Les deux sources BD TOPO partagent le MÊME détecteur (une seule requête). */
function detecteurDe(source: string): (deps: DepsDetection) => Promise<EditionDistante> {
  if (source.startsWith('bdtopo')) return detecterBdtopo;
  if (source === 'cadastre') return detecterCadastre;
  if (source === 'dila') return detecterDila;
  if (source === 'prada') return detecterPrada;
  throw new Error(`source non détectable : ${source}`);
}

/**
 * Exécute une passe de détection. Respecte l'interrupteur global, l'activation PAR SOURCE, et la cadence (une source
 * vérifiée récemment est ignorée). Chaque source est isolée : un échec est PERSISTÉ (succes=false + motif) et n'empêche
 * pas les autres. Les deux sources BD TOPO partagent une seule requête (cache par passe).
 */
export async function executerDetection(deps: DepsDetection): Promise<ResumeDetection> {
  const cfg = await deps.config();
  if (!cfg.active) return { active: false, verifiees: [], ignorees: [...SOURCES_PROBEES] };

  const etats = await deps.etats();
  const now = deps.maintenant();
  const intervalleMs = cfg.intervalleHeures * 3_600_000;
  const cache = new Map<string, Promise<EditionDistante>>();
  const verifiees: string[] = [];
  const ignorees: string[] = [];

  for (const source of SOURCES_PROBEES) {
    const e = etats.get(source);
    const actif = e?.actif ?? true; // source absente de la table → réputée surveillée
    if (!actif) { ignorees.push(source); continue; } // réglage désactivé → JAMAIS interrogée

    const verifieLe = e?.verifieLe ?? null;
    const due = verifieLe === null || now.getTime() - verifieLe.getTime() >= intervalleMs;
    if (!due) { ignorees.push(source); continue; } // vérifiée récemment → on n'interroge pas

    try {
      const cleProbe = source.startsWith('bdtopo') ? 'bdtopo' : source; // une seule requête pour les 2 sources BD TOPO
      let p = cache.get(cleProbe);
      if (!p) { p = detecteurDe(source)(deps); cache.set(cleProbe, p); }
      const r = await p;
      await deps.enregistrer(source, { succes: true, editionDistante: r.editionDistante, dateDistante: r.dateDistante, motif: null }, now);
    } catch (err) {
      // Isolation : l'échec est journalisé (jamais « à jour »), la boucle continue avec les autres sources.
      await deps.enregistrer(source, { succes: false, editionDistante: null, dateDistante: null, motif: message(err) }, now);
    }
    verifiees.push(source);
  }
  return { active: true, verifiees, ignorees };
}
