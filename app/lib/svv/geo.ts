/**
 * Géométrie pure Sans Vis-à-Vis® — AUCUNE donnée IGN, AUCUNE BDD.
 *
 * Fonctions pures et typées s'appuyant exclusivement sur les constantes de
 * `config.ts` (jamais de 200 / 61 / 3 « en dur »).
 *
 * RÈGLE AUTORITATIVE (CLAUDE.md §5) : la distance de référence du projet est la
 * distance euclidienne en Lambert-93 (EPSG:2154). Les coordonnées GPS (WGS84,
 * EPSG:4326) sont transformées en L93 à l'entrée. Aucun arrondi.
 */
import proj4 from 'proj4';
import {
  ANALYSIS_RANGE_M,
  CORRIDOR_STEP_M,
  AMPLITUDE_BEAM_STEP_DEG,
  AMPLITUDE_BEAM_COUNT,
} from './config';

/** Définition Lambert-93 (EPSG:2154). Chaîne arrêtée — ne pas modifier. */
export const LAMBERT93_PROJ =
  '+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';

const WGS84 = 'EPSG:4326';
const LAMBERT93 = 'EPSG:2154';

proj4.defs(LAMBERT93, LAMBERT93_PROJ);

export interface PointWgs84 {
  lat: number;
  lon: number;
}

export interface PointL93 {
  x: number;
  y: number;
}

export interface PointAxe extends PointL93 {
  /** Distance horizontale (m) depuis l'origine, le long de l'axe. */
  distance: number;
}

/** Rayon moyen de la Terre (m) — utilisé uniquement par l'approximation Haversine. */
const EARTH_RADIUS_M = 6_371_000;

const degToRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Transformation autoritaire WGS84 → Lambert-93, en mètres, sans arrondi.
 * proj4 attend [lon, lat] et renvoie [x, y].
 */
export function wgs84ToLambert93({ lat, lon }: PointWgs84): PointL93 {
  const [x, y] = proj4(WGS84, LAMBERT93, [lon, lat]);
  return { x, y };
}

/** Inverse Lambert-93 → WGS84 (utile pour les tests de round-trip). */
export function lambert93ToWgs84({ x, y }: PointL93): PointWgs84 {
  const [lon, lat] = proj4(LAMBERT93, WGS84, [x, y]);
  return { lat, lon };
}

/**
 * Distance de référence du projet : distance euclidienne en mètres entre deux
 * points Lambert-93. Aucun arrondi.
 */
export function distanceLambert93(a: PointL93, b: PointL93): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Distance Haversine (m) entre deux points WGS84.
 *
 * APPROXIMATION D'APPOINT UNIQUEMENT (estimation rapide / affichage) — n'est
 * JAMAIS la source autoritative. Utiliser `distanceLambert93` pour tout calcul
 * ou verdict (CLAUDE.md §5).
 */
export function haversineMeters(a: PointWgs84, b: PointWgs84): number {
  const dLat = degToRad(b.lat - a.lat);
  const dLon = degToRad(b.lon - a.lon);
  const lat1 = degToRad(a.lat);
  const lat2 = degToRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Normalise un azimut en degrés dans l'intervalle [0, 360). */
export function normalizeAzimut(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Échantillonne l'axe principal depuis l'origine (L93) jusqu'à
 * `ANALYSIS_RANGE_M`, au pas `CORRIDOR_STEP_M`.
 *
 * Azimut en degrés géographiques : 0 = Nord, sens horaire. En Lambert-93,
 * x = Est, y = Nord → dx = sin(azimut), dy = cos(azimut).
 *
 * Le premier point est l'origine (distance 0), le dernier est à
 * `ANALYSIS_RANGE_M`.
 */
export function genererPointsAxe(origineL93: PointL93, azimutDeg: number): PointAxe[] {
  const rad = degToRad(azimutDeg);
  const ux = Math.sin(rad);
  const uy = Math.cos(rad);
  const points: PointAxe[] = [];
  for (let distance = 0; distance < ANALYSIS_RANGE_M; distance += CORRIDOR_STEP_M) {
    points.push({
      x: origineL93.x + ux * distance,
      y: origineL93.y + uy * distance,
      distance,
    });
  }
  // Garantit un dernier point exactement à la portée d'analyse.
  points.push({
    x: origineL93.x + ux * ANALYSIS_RANGE_M,
    y: origineL93.y + uy * ANALYSIS_RANGE_M,
    distance: ANALYSIS_RANGE_M,
  });
  return points;
}

/**
 * Azimuts des faisceaux d'amplitude, de (azimut − 90) à (azimut + 90) au pas
 * angulaire `AMPLITUDE_BEAM_STEP_DEG`, soit `AMPLITUDE_BEAM_COUNT` faisceaux.
 * Chaque azimut est normalisé dans [0, 360).
 */
export function genererFaisceauxAmplitude(azimutPrincipalDeg: number): number[] {
  const demiOuverture = ((AMPLITUDE_BEAM_COUNT - 1) / 2) * AMPLITUDE_BEAM_STEP_DEG;
  const azimuts: number[] = [];
  for (let i = 0; i < AMPLITUDE_BEAM_COUNT; i++) {
    const angle = azimutPrincipalDeg - demiOuverture + i * AMPLITUDE_BEAM_STEP_DEG;
    azimuts.push(normalizeAzimut(angle));
  }
  return azimuts;
}
