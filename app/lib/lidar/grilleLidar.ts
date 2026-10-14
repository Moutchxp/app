/**
 * ══ IMPORT LiDAR HD — LA GRILLE DES DALLES (lot du 14/10/2026, décision d'Arno : cercle de 35 km autour de Notre-Dame) ══
 *
 * PUR (aucune base, aucun réseau). La géométrie est celle MESURÉE sur la seule dalle en base (Asnières) :
 *   · une dalle IGN LiDAR HD MNS/MNT 0,5 m = 2 000 × 2 000 pixels de 0,5 m, Lambert-93 (EPSG:2154) ;
 *   · son nom porte les kilomètres X (bord OUEST) et Y (bord NORD) : `LHD_FXX_0646_6868_MNS_…` couvre
 *     X ∈ [645 999,75 ; 646 999,75] et Y ∈ [6 867 000,25 ; 6 868 000,25] (grille décalée d'un demi-pixel, mesuré :
 *     ST_UpperLeftX/Y = 645999.75 / 6868000.25) ;
 *   · en base, chaque dalle est découpée en tuiles de 256 × 256 px (bords : 208 px, car 2 000 = 7 × 256 + 208), soit
 *     8 × 8 = 64 tuiles par dalle ET par couche (mesuré : 64 lignes dans mns_lidar_brut comme dans mnt_lidar_brut).
 */

export const PAS_PIXEL_M = 0.5;
export const PIXELS_PAR_DALLE = 2000;
export const TAILLE_DALLE_M = PAS_PIXEL_M * PIXELS_PAR_DALLE; // 1 000 m
export const DEMI_PIXEL_M = PAS_PIXEL_M / 2;
export const TAILLE_TUILE_PX = 256;
export const TUILES_PAR_COTE = Math.ceil(PIXELS_PAR_DALLE / TAILLE_TUILE_PX); // 8
export const TUILES_PAR_DALLE = TUILES_PAR_COTE * TUILES_PAR_COTE; // 64
export const NODATA = -9999;
export const SRID = 2154;
/** Poids MESURÉ en base d'une dalle d'une couche (pg_total_relation_size, 64 tuiles d'Asnières). */
export const OCTETS_PAR_DALLE_ET_COUCHE = 16_752_640;

export type CoucheLidar = 'MNS' | 'MNT';
export const COUCHES: readonly CoucheLidar[] = ['MNS', 'MNT'];
/** La table de chaque couche — les SEULES tables que l'outil écrit. */
export const TABLE_DE_COUCHE: Readonly<Record<CoucheLidar, string>> = { MNS: 'mns_lidar_brut', MNT: 'mnt_lidar_brut' };

/** Décision d'Arno : parvis de Notre-Dame, rayon 35 km + 1 km de marge. */
export const CENTRE_NOTRE_DAME_WGS84 = { lat: 48.853, lon: 2.3499 } as const;
export const RAYON_DEFAUT_M = 36_000;

export interface Dalle {
  /** Kilomètre du bord OUEST (ex. 646). */
  xKm: number;
  /** Kilomètre du bord NORD (ex. 6868). */
  yKm: number;
}

/** « 0646_6868 » : la clé de la dalle, celle de la nomenclature IGN. PUR. */
export function nomDalle(d: Dalle): string {
  return `${String(d.xKm).padStart(4, '0')}_${String(d.yKm).padStart(4, '0')}`;
}

/** L'inverse de `nomDalle` ; `null` si la chaîne n'est pas une clé de dalle. PUR. */
export function lireNomDalle(s: string): Dalle | null {
  const m = /^(\d{3,4})_(\d{4})$/.exec(s.trim());
  return m ? { xKm: Number(m[1]), yKm: Number(m[2]) } : null;
}

/** L'emprise exacte de la dalle en Lambert-93 (bords des pixels), telle que l'IGN la livre. PUR. */
export function empriseDalle(d: Dalle): { xmin: number; xmax: number; ymin: number; ymax: number } {
  const xmin = d.xKm * 1000 - DEMI_PIXEL_M;
  const ymax = d.yKm * 1000 + DEMI_PIXEL_M;
  return { xmin, xmax: xmin + TAILLE_DALLE_M, ymin: ymax - TAILLE_DALLE_M, ymax };
}

/** La transformation affine attendue du GeoTIFF (format GDAL : [x0, pas, 0, y0, 0, -pas]). PUR. */
export function geoTransformAttendue(d: Dalle): [number, number, number, number, number, number] {
  const e = empriseDalle(d);
  return [e.xmin, PAS_PIXEL_M, 0, e.ymax, 0, -PAS_PIXEL_M];
}

/** Distance d'un point à un rectangle (0 s'il est dedans). PUR. */
function distancePointRectangle(x: number, y: number, e: { xmin: number; xmax: number; ymin: number; ymax: number }): number {
  const dx = x < e.xmin ? e.xmin - x : x > e.xmax ? x - e.xmax : 0;
  const dy = y < e.ymin ? e.ymin - y : y > e.ymax ? y - e.ymax : 0;
  return Math.hypot(dx, dy);
}

/**
 * Les dalles dont l'emprise INTERSECTE le disque (centre Lambert-93, rayon en mètres) — dalles de bord incluses : une
 * dalle à peine effleurée par le cercle est chargée. Ordre stable : ouest → est, puis nord → sud. PUR.
 */
export function dallesDuCercle(centre: { x: number; y: number }, rayonM: number): Dalle[] {
  if (!(rayonM > 0)) return [];
  const out: Dalle[] = [];
  const xKmMin = Math.floor((centre.x - rayonM + DEMI_PIXEL_M) / 1000);
  const xKmMax = Math.floor((centre.x + rayonM + DEMI_PIXEL_M) / 1000);
  const yKmMin = Math.ceil((centre.y - rayonM - DEMI_PIXEL_M) / 1000);
  const yKmMax = Math.ceil((centre.y + rayonM - DEMI_PIXEL_M) / 1000);
  for (let xKm = xKmMin; xKm <= xKmMax; xKm += 1) {
    for (let yKm = yKmMax; yKm >= yKmMin; yKm -= 1) {
      const d = { xKm, yKm };
      if (distancePointRectangle(centre.x, centre.y, empriseDalle(d)) <= rayonM) out.push(d);
    }
  }
  return out;
}

export type EtatDalle = 'presente' | 'absente' | 'incoherente';

/**
 * L'état d'une dalle en base d'après le nombre de tuiles de chaque couche dont le centre tombe dans son emprise :
 * 64 / 64 → présente ; 0 / 0 → absente ; tout autre compte → INCOHÉRENTE (trou ou doublon) — jamais touchée par
 * l'outil, seulement signalée. PUR.
 */
export function etatDalle(tuiles: Readonly<Record<CoucheLidar, number>>): EtatDalle {
  if (tuiles.MNS === TUILES_PAR_DALLE && tuiles.MNT === TUILES_PAR_DALLE) return 'presente';
  if (tuiles.MNS === 0 && tuiles.MNT === 0) return 'absente';
  return 'incoherente';
}

/** Volume estimé en base pour `n` dalles (deux couches), en octets. PUR. */
export function volumeEstimeOctets(n: number): number {
  return n * OCTETS_PAR_DALLE_ET_COUCHE * COUCHES.length;
}
