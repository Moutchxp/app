/**
 * Projection Lambert-93 (EPSG:2154) → coordonnées SVG (chantier S6) — PUR. Le Lambert-93 est une projection CONFORME
 * déjà planaire : passer aux pixels SVG est une simple transformation linéaire (échelle uniforme + inversion de l'axe Y,
 * l'écran allant vers le bas). On NE reprojette PAS en 4326. Aucune dépendance, aucune I/O.
 */

export type Bbox = [xmin: number, ymin: number, xmax: number, ymax: number];
export interface DimsSvg { largeur: number; hauteur: number; marge?: number }

/** Tolérance de simplification (m, Lambert-93). 100 m : imperceptible à l'échelle d'un aperçu 4 départements (~2 px),
 *  et `ST_CoverageSimplify` PRÉSERVE les bords partagés → aucun trou entre voisines (≠ ST_SimplifyPreserveTopology). */
export const TOLERANCE_SIMPLIFICATION_M = 100;
/** Seuil de charge utile de la carte (GeoJSON L93). Mesuré à ~266 ko à 100 m ; plafond de sécurité 300 ko. */
export const SEUIL_PAYLOAD_CARTE_OCTETS = 300_000;

/** Échelle uniforme (px par mètre) qui fait tenir la bbox L93 dans le cadre SVG (marge comprise), + décalages de centrage. */
export function ajustement(bbox: Bbox, dims: DimsSvg): { echelle: number; dx: number; dy: number } {
  const marge = dims.marge ?? 0;
  const [xmin, ymin, xmax, ymax] = bbox;
  const largeurM = Math.max(xmax - xmin, 1e-9);
  const hauteurM = Math.max(ymax - ymin, 1e-9);
  const utileW = Math.max(dims.largeur - 2 * marge, 1);
  const utileH = Math.max(dims.hauteur - 2 * marge, 1);
  const echelle = Math.min(utileW / largeurM, utileH / hauteurM); // uniforme → pas de distorsion
  // Centre le contenu dans le cadre.
  const dx = marge + (utileW - largeurM * echelle) / 2;
  const dy = marge + (utileH - hauteurM * echelle) / 2;
  return { echelle, dx, dy };
}

/**
 * Projette un point L93 (x=Est, y=Nord) en pixel SVG. L'axe Y est INVERSÉ (Nord en haut) : plus y (Nord) est grand,
 * plus la coordonnée SVG est petite. `ymax` sert de référence du haut.
 */
export function projeterL93VersSvg(x: number, y: number, bbox: Bbox, a: { echelle: number; dx: number; dy: number }): [number, number] {
  const [xmin, , , ymax] = bbox;
  return [a.dx + (x - xmin) * a.echelle, a.dy + (ymax - y) * a.echelle];
}

/** Un anneau L93 (liste de [x,y]) → attribut `points`/`d` SVG (via projection). */
export function anneauVersSvg(anneau: [number, number][], bbox: Bbox, a: { echelle: number; dx: number; dy: number }): string {
  return anneau.map(([x, y]) => {
    const [sx, sy] = projeterL93VersSvg(x, y, bbox, a);
    return `${sx.toFixed(1)},${sy.toFixed(1)}`;
  }).join(' ');
}

/** Bbox englobante d'un ensemble d'anneaux L93 (pour recentrer sur une sélection / un département). */
export function bboxDe(anneaux: [number, number][][]): Bbox {
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (const ring of anneaux) for (const [x, y] of ring) {
    if (x < xmin) xmin = x; if (y < ymin) ymin = y; if (x > xmax) xmax = x; if (y > ymax) ymax = y;
  }
  return [xmin, ymin, xmax, ymax];
}
