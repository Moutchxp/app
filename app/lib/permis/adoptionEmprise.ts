/**
 * PROJ-3q — GROUPEMENT des polygones « en projet » IGN à ADOPTER comme emprise. PUR, aucune I/O.
 *
 * RÈGLE MÉTIER (Arno) : les polygones cochés qui SE TOUCHENT fusionnent en UNE emprise ; chaque GROUPE de polygones qui se touchent
 * est une emprise INDÉPENDANTE ; deux groupes disjoints ne fusionnent JAMAIS.
 *
 * PRÉDICAT « se touchent » retenu = **partagent au moins un point** (contact par un bord OU un simple sommet suffit). Concrètement,
 * deux anneaux (contours extérieurs) se touchent si :
 *   · une arête de l'un croise/touche une arête de l'autre (couvre bord commun ET sommet commun : des extrémités coïncidentes
 *     comptent comme une intersection), OU
 *   · un sommet de l'un est à l'intérieur (ou sur le bord) de l'autre (couvre l'inclusion / le recouvrement).
 * Équivalent applicatif de `ST_Intersects` de PostGIS (partage d'au moins un point), calculé sur les contours extérieurs — suffisant
 * pour du bâti IGN (polygones simples, sans trou pertinent au groupement). Le regroupement est fait CÔTÉ SERVEUR à partir des
 * géométries lues en base ; la géométrie fusionnée de chaque groupe (union) est ensuite calculée par PostGIS (autoritaire).
 */
import type { PointLambert } from './calageEmprise';

export interface PolygoneAdoptable { cleabs: string; anneau: PointLambert[] }

/** Orientation du triplet (o, a, b) : >0 anti-horaire, <0 horaire, 0 colinéaire. PUR. */
function orientation(o: PointLambert, a: PointLambert, b: PointLambert): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** `p` est-il sur le segment [a,b] (bornes comprises), en supposant la colinéarité déjà établie ? PUR. */
function surSegment(a: PointLambert, b: PointLambert, p: PointLambert): boolean {
  return Math.min(a.x, b.x) <= p.x && p.x <= Math.max(a.x, b.x) && Math.min(a.y, b.y) <= p.y && p.y <= Math.max(a.y, b.y);
}

/** Les segments [p1,p2] et [p3,p4] partagent-ils au moins un point (croisement propre, contact d'extrémité, ou chevauchement colinéaire) ? PUR. */
export function segmentsSeTouchent(p1: PointLambert, p2: PointLambert, p3: PointLambert, p4: PointLambert): boolean {
  const d1 = orientation(p3, p4, p1);
  const d2 = orientation(p3, p4, p2);
  const d3 = orientation(p1, p2, p3);
  const d4 = orientation(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true; // croisement propre
  if (d1 === 0 && surSegment(p3, p4, p1)) return true; // p1 sur [p3,p4] (extrémité / colinéaire)
  if (d2 === 0 && surSegment(p3, p4, p2)) return true;
  if (d3 === 0 && surSegment(p1, p2, p3)) return true;
  if (d4 === 0 && surSegment(p1, p2, p4)) return true;
  return false;
}

/** `pt` est-il strictement à l'intérieur de l'anneau `ring` (lancer de rayon) ? PUR. (Le contact de bord est traité par segmentsSeTouchent.) */
export function pointDansPolygone(pt: PointLambert, ring: PointLambert[]): boolean {
  let dedans = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if (((a.y > pt.y) !== (b.y > pt.y)) && (pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x)) dedans = !dedans;
  }
  return dedans;
}

/** Deux anneaux partagent-ils au moins un point (bord, sommet, ou inclusion) ? PUR — prédicat « se touchent ». */
export function polygonesSeTouchent(a: PointLambert[], b: PointLambert[]): boolean {
  if (a.length < 3 || b.length < 3) return false;
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i], a2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      const b1 = b[j], b2 = b[(j + 1) % b.length];
      if (segmentsSeTouchent(a1, a2, b1, b2)) return true;
    }
  }
  return pointDansPolygone(a[0], b) || pointDansPolygone(b[0], a); // inclusion (aucun bord partagé)
}

/**
 * Sépare les polygones en COMPOSANTES CONNEXES par le prédicat « se touchent » (union-find). Ordre des groupes STABLE (par plus
 * petit index d'origine) ; à l'intérieur d'un groupe, ordre d'origine conservé. Un polygone isolé forme un groupe d'un seul élément.
 * PUR — aucune géométrie fusionnée ici (l'union est faite par PostGIS ensuite).
 */
export function grouperPolygonesConnexes(polys: PolygoneAdoptable[]): PolygoneAdoptable[][] {
  const n = polys.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const trouver = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const unir = (x: number, y: number): void => { const rx = trouver(x), ry = trouver(y); if (rx !== ry) parent[Math.max(rx, ry)] = Math.min(rx, ry); };
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (polygonesSeTouchent(polys[i].anneau, polys[j].anneau)) unir(i, j);
  const groupes = new Map<number, PolygoneAdoptable[]>();
  for (let i = 0; i < n; i++) { const r = trouver(i); (groupes.get(r) ?? groupes.set(r, []).get(r)!).push(polys[i]); }
  return [...groupes.keys()].sort((a, b) => a - b).map((k) => groupes.get(k)!);
}
