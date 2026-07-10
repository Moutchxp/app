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
export interface CelluleCommune {
  commune_insee: string;
  n: number;
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
export interface Statistiques {
  fenetre: Fenetre;
  k: number;
  trafic: PointTrafic[];
  verdicts: RepartitionVerdicts;
  analyses: ComptesAnalyses;
  entonnoir: PointEntonnoir[];
  communes: VentilationSure<CelluleCommune>;
  provenance: Provenance;
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

/** URL de l'API de LECTURE (Lot 4). Le client NE FAIT QUE consommer cette API — jamais la base. */
export function construireUrl(f: Fenetre): string {
  const p = new URLSearchParams({ debut: f.debut, fin: f.fin, grain: f.grain });
  return `/api/admin/statistiques?${p.toString()}`;
}

// ── Formatage & masquage (jamais de reconstitution) ──────────────────────────────────────────────────
export const MASQUE = '—';
/** Sous ce plancher de N, on affiche le compte brut + « échantillon faible », jamais un % (SPEC §4). Seuil
 *  d'AFFICHAGE (honnêteté), distinct du seuil d'anonymat k qui est appliqué et fourni par l'API (Lot 4). */
export const PLANCHER_N = 30;

export function formatNombre(n: number): string {
  return n.toLocaleString('fr-FR');
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
  'Les visites, l’entonnoir et la provenance n’apparaissent qu’après le job de maintenance (cron, lot 3) : ' +
  'sans cron branché, ces métriques restent vides même en cas de trafic, et les jours récents sous-comptent.';
