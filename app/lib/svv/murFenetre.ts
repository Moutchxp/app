/**
 * ══ 🔴 LOT P — LE MUR DE LA FENÊTRE ET LE PIVOT DE L'ÉVENTAIL DU SCORE (décision d'Arno du 22/10/2026) ═══════════════════
 *
 * En mode « Façade (snap) », les 61 faisceaux du SCORE sont centrés sur la NORMALE EXTÉRIEURE du mur de la fenêtre, et non
 * plus sur l'azimut choisi : une fenêtre ne voit pas derrière son propre mur, et l'ancien éventail, centré sur un azimut tenu
 * de travers, envoyait en moyenne 11 faisceaux sur 61 à travers le propre immeuble (« voir » à 70–150 m). Diagnostic :
 * .captures/diagnostic-ulbach/fenetre/SYNTHESE-lot1-lot2.md (option d).
 *
 * P2 — le mur : le côté du contour BD TOPO du propre bâtiment qui porte le point snappé. Si le point est à moins de
 *      RAYON_SOMMET_MUR_M d'un sommet du contour (coin saillant ou rentrant), on prend, parmi les côtés concernés (le côté qui
 *      porte le point et les côtés de ces sommets), celui dont la normale extérieure est la plus proche de l'azimut choisi.
 *      Égalité : le côté qui porte le point. Normale extérieure = orientée vers l'extérieur du polygone.
 * P6 — un azimut stocké hors 0–360° (−27°, 378°) est ramené modulo 360 AU MOMENT DU CALCUL ; rien n'est réécrit.
 *
 * PUR : aucune base, aucun réseau. Repère Lambert-93 (x = Est, y = Nord) ; azimut géographique (Nord, sens horaire).
 * Aucun arrondi.
 */
import { RAYON_SOMMET_MUR_M } from './config';

type P2 = readonly [number, number];

/** P6 — azimut ramené dans [0, 360[. */
export function normaliserAzimut(azimutDeg: number): number {
  return ((azimutDeg % 360) + 360) % 360;
}

/** Écart angulaire absolu entre deux azimuts, dans [0, 180]. */
export function ecartAzimuts(a: number, b: number): number {
  return Math.abs(((((a - b) % 360) + 540) % 360) - 180);
}

/** Azimut géographique d'un vecteur (x = Est, y = Nord), dans [0, 360[. */
function azimutDe(v: P2): number {
  return normaliserAzimut((Math.atan2(v[0], v[1]) * 180) / Math.PI);
}

/** POLYGON / MULTIPOLYGON en WKT (2D, tel que `ST_AsText(ST_Force2D(geom))`) → polygones → anneaux fermés. */
export function lirePolygonesWkt(wkt: string): P2[][][] {
  const corps = wkt.trim().replace(/^(MULTI)?POLYGON\s*/i, '');
  const multi = /^\s*MULTIPOLYGON/i.test(wkt);
  const interieur = corps.slice(1, -1);
  const blocs = multi ? interieur.split(/\)\s*\)\s*,\s*\(\s*\(/) : [interieur];
  return blocs.map((b) => b.replace(/^\(+|\)+$/g, '').split(/\)\s*,\s*\(/).map((anneau) =>
    anneau.replace(/[()]/g, '').split(',').map((c) => {
      const [x, y] = c.trim().split(/\s+/).map(Number);
      return [x, y] as const;
    })));
}

function dansAnneau(p: P2, a: P2[]): boolean {
  let dedans = false;
  for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
    const [xi, yi] = a[i];
    const [xj, yj] = a[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}
/** Le point est-il dans le polygone (trous compris) ? */
export function dansPolygones(p: P2, polys: P2[][][]): boolean {
  return polys.some((anneaux) => dansAnneau(p, anneaux[0]) && !anneaux.slice(1).some((t) => dansAnneau(p, t)));
}

/** Côté du contour : extrémités, direction unitaire, normale EXTÉRIEURE unitaire. */
export interface CoteContour { a: P2; b: P2; normale: P2; azimutNormaleDeg: number }

/** Distance de sondage (m) pour décider de quel côté d'une arête se trouve l'intérieur du polygone. */
const SONDE_INTERIEUR_M = 0.05;

function coteDe(a: P2, b: P2, polys: P2[][][]): CoteContour | null {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = Math.hypot(dx, dy);
  if (L === 0) return null;
  const gauche: P2 = [-dy / L, dx / L];
  const milieu: P2 = [a[0] + dx / 2, a[1] + dy / 2];
  const sonde: P2 = [milieu[0] + gauche[0] * SONDE_INTERIEUR_M, milieu[1] + gauche[1] * SONDE_INTERIEUR_M];
  const normale: P2 = dansPolygones(sonde, polys) ? [-gauche[0], -gauche[1]] : gauche;
  return { a, b, normale, azimutNormaleDeg: azimutDe(normale) };
}

function distancePointSegment(p: P2, a: P2, b: P2): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy;
  const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

export interface MurFenetre {
  /** Le côté retenu (P2). */
  cote: CoteContour;
  /** Azimut de sa normale extérieure : le centre de l'éventail du score. */
  azimutNormaleDeg: number;
  /** Écart entre l'azimut choisi et cette normale, dans [0, 180]. */
  ecartDeg: number;
  /** Sommets du contour à moins de RAYON_SOMMET_MUR_M du point (0 = côté qui porte le point, seul candidat). */
  sommetsProches: number;
}

/**
 * P2 — le mur de la fenêtre pour un point snappé (L93) sur le contour du propre bâtiment. `null` si le polygone est vide.
 */
export function murDeLaFenetre(polygoneWkt: string, point: { x: number; y: number }, azimutChoisiDeg: number): MurFenetre | null {
  const polys = lirePolygonesWkt(polygoneWkt);
  const p: P2 = [point.x, point.y];
  const az = normaliserAzimut(azimutChoisiDeg);
  const cotes: { c: CoteContour; d: number; ia: number; ib: number; anneau: P2[] }[] = [];
  for (const anneaux of polys) for (const anneau of anneaux) for (let i = 0; i < anneau.length - 1; i++) {
    const c = coteDe(anneau[i], anneau[i + 1], polys);
    if (c) cotes.push({ c, d: distancePointSegment(p, anneau[i], anneau[i + 1]), ia: i, ib: i + 1, anneau });
  }
  if (cotes.length === 0) return null;
  const porteur = cotes.reduce((m, k) => (k.d < m.d ? k : m));
  // Sommets à moins de RAYON_SOMMET_MUR_M : les côtés qui y aboutissent deviennent candidats.
  const proches = new Set<string>();
  for (const k of cotes) for (const s of [k.c.a, k.c.b]) if (Math.hypot(s[0] - p[0], s[1] - p[1]) < RAYON_SOMMET_MUR_M) proches.add(`${s[0]},${s[1]}`);
  const candidats = cotes.filter((k) => k === porteur || proches.has(`${k.c.a[0]},${k.c.a[1]}`) || proches.has(`${k.c.b[0]},${k.c.b[1]}`));
  let retenu = porteur;
  for (const k of candidats) if (ecartAzimuts(k.c.azimutNormaleDeg, az) < ecartAzimuts(retenu.c.azimutNormaleDeg, az)) retenu = k;
  return { cote: retenu.c, azimutNormaleDeg: retenu.c.azimutNormaleDeg, ecartDeg: ecartAzimuts(retenu.c.azimutNormaleDeg, az), sommetsProches: proches.size };
}
