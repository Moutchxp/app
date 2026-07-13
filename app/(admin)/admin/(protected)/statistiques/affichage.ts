/**
 * M2 — LOT 5 (tableau de bord). LOGIQUE D'AFFICHAGE PURE, testable sans rendu. Le dashboard CONSOMME
 * l'API de lecture du Lot 4 (`GET /api/admin/statistiques`) et l'AFFICHE ; il ne calcule AUCUNE métrique,
 * n'accède JAMAIS à la base, ne RECONSTITUE JAMAIS une valeur masquée par l'API.
 *
 * ⚠️ Les types ci-dessous MIRRORENT le contrat de l'API (Lot 4) mais NE SONT PAS importés de
 * `app/lib/analytics/lecture/**` : cette couche est `server-only` (pool `pg`), l'importer côté client la
 * ferait entrer dans le bundle navigateur. Le découplage est total (garde de test dédiée).
 */

// ── Contrat de l'API Lot 4 (miroir local, jamais importé du serveur) ──────────────────────────────────
export type Grain = 'jour' | 'semaine' | 'mois';
export interface Fenetre {
  debut: string; // 'YYYY-MM-DD'
  fin: string; //   'YYYY-MM-DD'
  grain: Grain;
}
export interface PointTrafic {
  bucket: string;
  visites: number;
}
export interface RepartitionVerdicts {
  sans_vis_a_vis: number;
  vis_a_vis: number;
  indetermine: number;
  total: number;
}
export interface ComptesAnalyses {
  lancees: number;
  resultats: number;
  certificats: number; //      clic_certificat
  plusvalue: number; //        clic_plusvalue
  estimationImmo: number; //   clic_estimation
  totalEstimations: number; // plusvalue + estimationImmo (sommé côté serveur)
}
export interface PointEntonnoir {
  etape: string;
  atteinte_max: number;
}
export interface GroupeMasque {
  nbCellules: number;
  total: number;
}
export interface VentilationSure<T> {
  visibles: T[];
  masque: GroupeMasque | null;
  insuffisant?: boolean;
}
// ── Chantier B : verdict dominant (miroir serveur) + filtres d'AFFICHAGE client ───────────────────────
export type VerdictType = 'SANS_VIS_A_VIS' | 'VIS_A_VIS' | 'INDETERMINE';
export type DominantVerdict = VerdictType;
/**
 * Filtres d'AFFICHAGE de la carte (Chantier B, révision post-revue adverse). Appliqués CÔTÉ CLIENT sur le SEUL
 * payload k-safe (JAMAIS un paramètre serveur → aucune nouvelle vue → aucune différenciation inter-vues qui
 * isolerait une cellule < k). `verdict` filtre par verdict DOMINANT (déjà anonymisé côté serveur) ; `departement`
 * par préfixe INSEE. Le filtre SCORE a été RETIRÉ : il aurait exigé des comptes par commune×tranche, vecteur de
 * différenciation. Cf. rapport, écart C.
 */
export interface FiltresGeo {
  verdict?: VerdictType | null;
  departement?: string | null;
}
export interface CelluleCommune {
  commune_insee: string;
  n: number;
  dominant?: DominantVerdict | null; // Chantier B : verdict dominant k-safe (couleur bulle) ; null = neutre (sous k)
}
/**
 * Filtre d'AFFICHAGE des communes déjà k-safe (renvoyées par l'API). PUR, client : ne requête rien, ne recalcule
 * aucune ventilation, ne révèle rien de plus que le payload déjà publié → INOFFENSIF pour le k. `verdict` garde les
 * communes dont le DOMINANT (déjà k-safe) matche ; `departement` celles dont le code INSEE commence par le dept.
 */
export function filtrerCommunesClient(visibles: CelluleCommune[], filtres: FiltresGeo): CelluleCommune[] {
  return visibles.filter(
    (c) =>
      (!filtres.verdict || c.dominant === filtres.verdict) &&
      (!filtres.departement || c.commune_insee.startsWith(filtres.departement)),
  );
}
export interface CelluleSource {
  source: string | null;
  medium: string | null;
  n: number;
}
export interface CelluleReferer {
  referer_hote: string | null;
  n: number;
}
export interface Provenance {
  par_source_medium: VentilationSure<CelluleSource>;
  par_referer: VentilationSure<CelluleReferer>;
}
// ── Lot 6 : série temporelle, verdicts scopés commune, référentiel cartographique (miroir de l'API) ────
export interface SeriePoint {
  bucket: string;
  visites: number;
  analysesLancees: number;
  resultats: number;
  sans: number;
  vis: number;
  ind: number;
  certificats: number; //      clic_certificat
  plusvalue: number; //        clic_plusvalue
  estimationImmo: number; //   clic_estimation
  totalEstimations: number; // plusvalue + estimationImmo
}
export interface CelluleVerdict {
  verdict: 'SANS_VIS_A_VIS' | 'VIS_A_VIS' | 'INDETERMINE';
  n: number;
}
export interface FiltreCommune {
  commune: string;
  verdicts: VentilationSure<CelluleVerdict>;
}
/** Référentiel cartographique (endpoint géo, hors k) : code INSEE → nom + centroïde [lon, lat] WGS84. */
export interface CentroideCommune {
  nom: string;
  centroid: [number, number];
}
export type RefCommunes = Record<string, CentroideCommune>;

export interface Statistiques {
  fenetre: Fenetre;
  k: number;
  trafic: PointTrafic[];
  verdicts: RepartitionVerdicts;
  analyses: ComptesAnalyses;
  entonnoir: PointEntonnoir[];
  communes: VentilationSure<CelluleCommune>;
  provenance: Provenance;
  serie: SeriePoint[];
  filtreCommune: FiltreCommune | null;
}

// ── Fenêtre temporelle ────────────────────────────────────────────────────────────────────────────────
/** Jour civil Europe/Paris 'YYYY-MM-DD' (le navigateur peut être ailleurs ; on aligne sur le Lot 4). */
export function jourParis(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Décale une date 'YYYY-MM-DD' de `jours` (arithmétique UTC → insensible au changement d'heure). */
export function decalerJours(iso: string, jours: number): string {
  const [a, m, j] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j + jours));
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

/** Fenêtre par défaut : 30 derniers jours, grain jour. */
export function fenetreDefaut(maintenant: Date = new Date()): Fenetre {
  const fin = jourParis(maintenant);
  return { debut: decalerJours(fin, -29), fin, grain: 'jour' };
}

export type NomPreset = '7j' | '30j' | '90j';
/** Presets de fenêtre relative (le sélecteur permet aussi une plage libre + un grain). */
export function preset(nom: NomPreset, grain: Grain, maintenant: Date = new Date()): Fenetre {
  const fin = jourParis(maintenant);
  const jours = nom === '7j' ? 7 : nom === '30j' ? 30 : 90;
  return { debut: decalerJours(fin, -(jours - 1)), fin, grain };
}

/** URL de l'API de LECTURE (Lot 4/6). Le client NE FAIT QUE consommer cette API — jamais la base. `commune`
 *  (Lot 6, filtre carte) → la lecture ajoute les verdicts scopés k-safe ; absent → vue globale. */
export function construireUrl(f: Fenetre, commune?: string | null): string {
  const p = new URLSearchParams({ debut: f.debut, fin: f.fin, grain: f.grain });
  if (commune) p.set('commune', commune);
  return `/api/admin/statistiques?${p.toString()}`;
}

/** Départements du périmètre RÉEL des données (Paris + petite/moyenne couronne). Sélecteur de filtre d'affichage. */
export const DEPARTEMENTS_IDF: ReadonlyArray<{ code: string; nom: string }> = [
  { code: '75', nom: 'Paris (75)' },
  { code: '92', nom: 'Hauts-de-Seine (92)' },
  { code: '93', nom: 'Seine-Saint-Denis (93)' },
  { code: '94', nom: 'Val-de-Marne (94)' },
  { code: '77', nom: 'Seine-et-Marne (77)' },
  { code: '78', nom: 'Yvelines (78)' },
  { code: '91', nom: 'Essonne (91)' },
  { code: '95', nom: 'Val-d’Oise (95)' },
];
/**
 * Couleur d'une bulle selon le verdict DOMINANT (déjà k-safe côté serveur). `null`/absent → gris clair NEUTRE :
 * une commune dont le dominant est indéterminable sous k n'est JAMAIS colorée (sinon oracle « quel verdict domine
 * à faible volume »). AUCUN bleu. Le client ne calcule rien : il applique la couleur d'un dominant fourni.
 */
export function couleurDominant(d: DominantVerdict | null | undefined): string {
  switch (d) {
    case 'SANS_VIS_A_VIS':
      return 'var(--color-svv-red)'; //   rouge : Sans vis-à-vis domine
    case 'VIS_A_VIS':
      return 'var(--color-svv-ink)'; //   gris foncé : Vis-à-vis domine
    case 'INDETERMINE':
      return 'var(--color-svv-muted)'; // gris moyen : Indéterminé domine
    default:
      return '#c9c9c9'; //                gris clair NEUTRE : dominant indéterminable sous k
  }
}
/** Endpoint du référentiel cartographique (Lot 6) : pure géo (centroïdes), hors k, jamais la base côté client. */
export const URL_GEO = '/api/admin/geo/communes';

// ── Formatage & masquage (jamais de reconstitution) ──────────────────────────────────────────────────
export const MASQUE = '—';
/** Sous ce plancher de N, on affiche le compte brut + « échantillon faible », jamais un % (SPEC §4). Seuil
 *  d'AFFICHAGE (honnêteté), distinct du seuil d'anonymat k qui est appliqué et fourni par l'API (Lot 4). */
export const PLANCHER_N = 30;

/**
 * Formate un entier en français. DÉFENSIF : une valeur absente/non finie (`undefined`/`null`/`NaN`) → `0`, jamais
 * une exception. Le contrat serveur garantit déjà « 0 si aucun événement » (`comptesAnalyses`), mais l'UI ne fait
 * pas confiance aveugle à la forme reçue : un skew de version (bundle client plus récent que la réponse en state,
 * réponse en cache d'AVANT l'ajout d'un compteur) ne DOIT jamais crasher toute la page via `undefined.toLocaleString()`.
 */
export function formatNombre(n: number | null | undefined): string {
  return (typeof n === 'number' && Number.isFinite(n) ? n : 0).toLocaleString('fr-FR');
}

/**
 * Libellé du groupe MASQUÉ d'une ventilation, tel que fourni par l'API — AUCUNE reconstitution. On
 * n'affiche jamais une valeur cachée, ni une soustraction (total − visibles). `insuffisant` → tout masqué ;
 * `masque` (≥2 zones, ≥k, sûr par construction Lot 4) → agrégat ; sinon rien.
 */
export function libelleMasque<T>(v: VentilationSure<T>): string | null {
  if (v.insuffisant) return 'Données insuffisantes pour l’anonymat';
  if (v.masque) {
    // Défense en profondeur : le contrat Lot 4 garantit un groupe masqué ≥ 2 zones ET ≥ k (sinon
    // `insuffisant`). Si un producteur moins strict renvoyait une seule zone, on refuse de restituer la
    // valeur de cette zone isolée (ce serait la dé-anonymiser) → on retombe sur « données insuffisantes ».
    if (v.masque.nbCellules < 2) return 'Données insuffisantes pour l’anonymat';
    return `${v.masque.nbCellules} zones masquées (total ${formatNombre(v.masque.total)})`;
  }
  return null;
}

export interface PartVerdict {
  cle: string;
  libelle: string;
  n: number;
  pct: number | null; // null si échantillon faible (< plancher) → on montre le compte, pas le %
}
/**
 * Parts de verdicts : % par bucket, OU « échantillon faible » sous le plancher (SPEC §4). Les COMPTES
 * viennent de l'API (jamais recalculés) ; on ne dérive que le % d'affichage.
 */
export function partsVerdicts(v: RepartitionVerdicts, plancher: number = PLANCHER_N): {
  parts: PartVerdict[];
  echantillonFaible: boolean;
} {
  const faible = v.total < plancher;
  const pct = (n: number) => (v.total > 0 && !faible ? Math.round((n / v.total) * 1000) / 10 : null);
  return {
    echantillonFaible: faible,
    parts: [
      { cle: 'SANS_VIS_A_VIS', libelle: 'Sans vis-à-vis', n: v.sans_vis_a_vis, pct: pct(v.sans_vis_a_vis) },
      { cle: 'VIS_A_VIS', libelle: 'Vis-à-vis', n: v.vis_a_vis, pct: pct(v.vis_a_vis) },
      { cle: 'INDETERMINE', libelle: 'Indéterminé', n: v.indetermine, pct: pct(v.indetermine) },
    ],
  };
}

const LIBELLE_ETAPE: Record<string, string> = {
  intro: 'Arrivée',
  photo: 'Photo',
  localisation: 'Localisation',
  axe: 'Axe de vue',
  infos_logement: 'Infos logement',
  analyse: 'Analyse',
  resultat: 'Résultat',
};
export interface PointFunnel {
  etape: string;
  libelle: string;
  atteinte_max: number; // visites dont c'est l'étape LA PLUS LOIN (donné par l'API)
  atteinte_min: number; // visites ayant atteint AU MOINS cette étape (cumul suffixe — dérivé pour l'entonnoir)
}
/**
 * Entonnoir : « a atteint au moins l'étape X » = somme suffixe des « étape la plus loin » fournies par
 * l'API. Dérivation d'AFFICHAGE des agrégats donnés (pas d'accès aux données brutes) ; l'étape n'est PAS
 * ré-identifiante (aucune donnée masquée en jeu) → aucun contournement de k possible.
 */
export function entonnoirCumule(points: PointEntonnoir[]): PointFunnel[] {
  const out: PointFunnel[] = [];
  let cumul = 0;
  for (let i = points.length - 1; i >= 0; i--) {
    cumul += points[i].atteinte_max; // le cumul suffixe inclut toujours l'étape (analyse = 0 → sans effet)
    // ⚠️ « analyse » n'est jamais instrumentée séparément (toujours 0, cf. modèle d'événements Lot 2) :
    // l'afficher suggérerait un point de contrôle mesuré qui ne l'est pas → on la RETIRE de l'entonnoir.
    if (points[i].etape === 'analyse') continue;
    out.unshift({
      etape: points[i].etape,
      libelle: LIBELLE_ETAPE[points[i].etape] ?? points[i].etape,
      atteinte_max: points[i].atteinte_max,
      atteinte_min: cumul,
    });
  }
  return out;
}

// ── Lot 6 : helpers PURS de la série (SVG maison) et de la carte (bulles) ─────────────────────────────
export const LIBELLE_VERDICT: Record<string, string> = {
  SANS_VIS_A_VIS: 'Sans vis-à-vis',
  VIS_A_VIS: 'Vis-à-vis',
  INDETERMINE: 'Indéterminé',
};
export type CleSerie =
  | 'visites'
  | 'analysesLancees'
  | 'resultats'
  | 'sans'
  | 'vis'
  | 'ind'
  | 'certificats'
  | 'plusvalue'
  | 'estimationImmo'
  | 'totalEstimations';

/**
 * Ratio d'AFFICHAGE `num/denom` en pourcentage (1 décimale). GARDE division par zéro : dénominateur ≤ 0 (ou
 * non fini) → `null` (l'appelant affiche « — »), JAMAIS NaN/Infinity. Pur calcul d'affichage sur des compteurs
 * déjà fournis par l'API — aucune reconstitution, aucun accès base.
 */
export function ratioPct(num: number, denom: number): number | null {
  if (!(denom > 0) || !Number.isFinite(num)) return null;
  return Math.round((num / denom) * 1000) / 10;
}
/** Max d'un ensemble de métriques sur la série (échelle Y commune aux courbes affichées). ≥ 1 (anti division par 0). */
export function maxSerie(serie: SeriePoint[], cles: CleSerie[]): number {
  let m = 0;
  for (const p of serie) for (const c of cles) if (p[c] > m) m = p[c];
  return Math.max(1, m);
}
/** Coordonnées d'affichage (x,y) d'une métrique dans un repère [0..largeur]×[0..hauteur] (y inversé, origine
 *  en haut à gauche comme en SVG). Série vide → tableau vide. Pur MISE EN PAGE : les valeurs sources ne sont
 *  jamais altérées (aucun arrondi métier — c'est de la géométrie d'écran). */
export function coordsSerie(serie: SeriePoint[], cle: CleSerie, max: number, largeur: number, hauteur: number): { x: number; y: number }[] {
  const n = serie.length;
  if (n === 0 || max <= 0) return [];
  return serie.map((p, i) => ({
    x: n > 1 ? (i * largeur) / (n - 1) : largeur / 2,
    y: hauteur - (p[cle] / max) * hauteur,
  }));
}
/** Points 'x,y …' d'une polyligne SVG (dérivés de `coordsSerie`). Série vide → chaîne vide (rien tracé). */
export function polySerie(serie: SeriePoint[], cle: CleSerie, max: number, largeur: number, hauteur: number): string {
  return coordsSerie(serie, cle, max, largeur, hauteur)
    .map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(' ');
}
/**
 * Paliers « ronds » d'un axe Y allant de 0 à un plafond ≥ `max`, pour un graphe lisible : les libellés
 * chiffrés se calent dessus, et le tracé s'échelonne sur le DERNIER palier (le plafond), pas sur `max` brut.
 * Le pas est arrondi au cran 1 / 2 / 5 × 10ⁿ au-dessus de `max / cibleIntervalles`, avec un PLANCHER de 1 :
 * ces séries comptent des ÉVÉNEMENTS ENTIERS → jamais de graduation fractionnaire. Retourne `[0, pas, 2·pas,
 * …, plafond]`, `plafond` = plus petit multiple du pas ≥ `max`. Défensif : `max` non fini ou ≤ 0 → traité
 * comme 1 (jamais d'axe vide). Pur (aucun état, aucune donnée base) → testable sans rendu. AUCUNE dimension
 * ajoutée : ne lit que le `max` déjà dérivé de la série GLOBALE (agrégée par bucket temporel). */
export function paliersAxeY(max: number, cibleIntervalles = 5): number[] {
  const m = Number.isFinite(max) && max > 0 ? max : 1;
  const brut = m / cibleIntervalles;
  const magnitude = Math.pow(10, Math.floor(Math.log10(brut)));
  const norm = brut / magnitude;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  const pas = Math.max(1, nice * magnitude); // plancher 1 : comptes entiers, pas de graduation décimale
  const plafond = Math.ceil(m / pas) * pas;
  const out: number[] = [];
  for (let v = 0; v <= plafond; v += pas) out.push(v);
  return out;
}
/** Rayon d'une bulle de carte : échelle RACINE bornée [min, plafond]. L'aire croît avec n mais reste
 *  APPROXIMATIVE (le plancher `min` de lisibilité casse la stricte proportionnalité aire ∝ n) → repère
 *  visuel RELATIF, jamais une mesure ; les comptes exacts vivent dans la liste et les popups. */
export function bulleRayon(n: number, max: number, min = 6, plafond = 26): number {
  if (n <= 0 || max <= 0) return min;
  return min + (plafond - min) * Math.sqrt(n / max);
}
export interface CommuneGeo {
  commune_insee: string;
  n: number;
  nom: string;
  lat: number;
  lon: number;
  dominant?: DominantVerdict | null; // Chantier B : verdict dominant k-safe (couleur), repris de la cellule serveur
}
/**
 * Joint les communes VISIBLES (k-safe, fournies par l'API) au référentiel cartographique (centroïdes). Une
 * commune sans centroïde connu est IGNORÉE (jamais tracée « au hasard »). Ne voit JAMAIS les masquées (absentes
 * de `visibles`) → la carte ne peut pas devenir un canal de ré-identification. Le `dominant` (déjà k-safe côté
 * serveur) est transporté tel quel pour la couleur — le client ne le recalcule jamais.
 */
export function joindreGeo(visibles: CelluleCommune[], ref: RefCommunes): CommuneGeo[] {
  const out: CommuneGeo[] = [];
  for (const c of visibles) {
    const g = ref[c.commune_insee];
    if (!g) continue;
    out.push({ commune_insee: c.commune_insee, n: c.n, nom: g.nom, lon: g.centroid[0], lat: g.centroid[1], dominant: c.dominant ?? null });
  }
  return out;
}

/** Vrai si le payload ne contient AUCUNE donnée exploitable (période vide / non compactée). */
export function estVide(s: Statistiques): boolean {
  const totalTrafic = s.trafic.reduce((a, p) => a + p.visites, 0);
  return (
    totalTrafic === 0 &&
    s.verdicts.total === 0 &&
    s.analyses.lancees === 0 &&
    s.analyses.resultats === 0 &&
    s.communes.visibles.length === 0 &&
    !s.communes.insuffisant
  );
}

/** Rappel d'exploitation : les métriques session_fin n'apparaissent qu'après passage du cron de maintenance. */
export const RAPPEL_CRON =
  'Les visites, l’entonnoir et la provenance n’apparaissent qu’après le traitement de maintenance quotidien : ' +
  'tant qu’il n’a pas tourné, ces indicateurs restent vides même en cas de trafic, et les jours récents sont sous-estimés.';
