/**
 * FUS-3d — logique PURE de l'affectation polygone BD TOPO ↔ corps de bâtiment. AUCUNE I/O.
 *  · REPÈRE d'affichage stable (A, B, C…) dérivé d'un index déterministe (l'ordre est fixé par la requête : ST_Y↓, ST_X, cleabs) ;
 *  · SCHÉMA SVG : les géométries sont en EPSG:2154 (mètres), on les projette dans une boîte et on émet des `path` — AUCUNE tuile,
 *    aucune projection cartographique. L'empreinte en fond, chaque polygone rempli + étiqueté par son repère ;
 *  · EXCLUSIVITÉ : un polygone affecté à un AUTRE corps n'est plus proposé ; réversibilité et cardinalités inégales gérées.
 */

export type Anneau = [number, number][];        // anneau extérieur, coordonnées Lambert-93 [x, y]
export interface GeomPoly { anneaux: Anneau[] }  // anneaux EXTÉRIEURS (les trous sont ignorés pour le schéma)

/** Repère bijectif base-26 : 0→A … 25→Z, 26→AA … (déterministe, stable tant que l'ordre d'entrée l'est). */
export function repereDepuisIndex(i: number): string {
  let n = i, s = '';
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}

/** Inverse de repereDepuisIndex : 'A'→0 … 'Z'→25, 'AA'→26 … (base-26 bijective). -1 si la chaîne n'est pas un repère valide. */
export function indexDepuisRepere(repere: string): number {
  if (!/^[A-Z]+$/.test(repere)) return -1;
  let n = 0;
  for (let k = 0; k < repere.length; k++) n = n * 26 + (repere.charCodeAt(k) - 64); // 'A' vaut 1 en base bijective
  return n - 1;
}

/**
 * L2 — palette FIXE et ORDONNÉE des polygones, indexée par le repère stable (A=0, B=1, …). Franc, distincte sur ≥ 16 entrées
 * (cas réel : 07512024V0037 a 16 polygones), répétée proprement au-delà (modulo). Déterministe : le polygone A a TOUJOURS la même
 * couleur — jamais un tirage au hasard ni dépendant de l'ordre d'une requête. AUCUNE n'est blanche (les polygones se détachent de
 * la parcelle blanche) ; AUCUNE n'est un rouge franc — le rouge est RÉSERVÉ au lot L5 (polygones nouveaux/modifiés). La couleur
 * n'est qu'une AIDE : le repère écrit (A, B, C…) reste la référence.
 */
export const PALETTE_REPERE = [
  '#1f77b4', // A bleu
  '#ff7f0e', // B orange
  '#2ca02c', // C vert
  '#9467bd', // D violet
  '#17becf', // E cyan
  '#bcbd22', // F jaune-vert
  '#e377c2', // G rose
  '#8c564b', // H brun
  '#008080', // I sarcelle
  '#d4a017', // J or
  '#3b3b8f', // K indigo
  '#556b2f', // L olive
  '#b5179e', // M magenta
  '#4fa3e0', // N ciel
  '#5c6b73', // O ardoise
  '#7fb800', // P chartreuse
] as const;

/** Couleur d'un polygone d'après l'index de son repère. Modulo → répétition PROPRE au-delà de la palette ; un index invalide
 *  (repère non reconnu, -1) retombe sur la dernière teinte (jamais blanc). */
export function couleurRepere(index: number): string {
  const n = PALETTE_REPERE.length;
  return PALETTE_REPERE[((index % n) + n) % n];
}

/** Extrait les anneaux EXTÉRIEURS d'une géométrie GeoJSON (Polygon | MultiPolygon). {anneaux:[]} sinon (jamais une exception). */
export function geomDepuisGeoJSON(gj: unknown): GeomPoly {
  const g = gj as { type?: string; coordinates?: unknown };
  if (!g || typeof g.type !== 'string') return { anneaux: [] };
  if (g.type === 'Polygon') { const c = g.coordinates as Anneau[] | undefined; return { anneaux: c && c[0] ? [c[0]] : [] }; }
  if (g.type === 'MultiPolygon') { const c = g.coordinates as Anneau[][] | undefined; return { anneaux: (c ?? []).map((p) => p[0]).filter(Boolean) }; }
  return { anneaux: [] };
}

export interface PolygoneEntreeSchema { repere: string; cleabs: string | null; geom: GeomPoly; horsEmpreinte: boolean }
export interface PolygoneSchema { repere: string; cleabs: string | null; path: string; cx: number; cy: number; horsEmpreinte: boolean }
export interface SchemaEmpreinte { largeur: number; hauteur: number; empreintePath: string | null; polygones: PolygoneSchema[]; motif: string | null }

const arrondi = (x: number): number => Math.round(x * 10) / 10;

// L5 — cadrage (bbox Lambert-93). Deux schémas comparés doivent partager le MÊME cadre, sinon les formes ne se correspondent pas.
export interface Cadre { minX: number; maxX: number; minY: number; maxY: number }

/** Bbox des points (empreinte + polygones) d'un schéma, en Lambert-93. null si aucun point (rien à cadrer). */
export function cadreDe(empreinte: GeomPoly | null, polygones: PolygoneEntreeSchema[]): Cadre | null {
  const pts: [number, number][] = [...(empreinte?.anneaux.flat() ?? []), ...polygones.flatMap((p) => p.geom.anneaux.flat())];
  if (pts.length === 0) return null;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/** Cadre COMMUN = enveloppe des deux cadres (échelle + cadrage identiques pour les deux schémas). null-safe. */
export function unionCadre(a: Cadre | null, b: Cadre | null): Cadre | null {
  if (!a) return b;
  if (!b) return a;
  return { minX: Math.min(a.minX, b.minX), maxX: Math.max(a.maxX, b.maxX), minY: Math.min(a.minY, b.minY), maxY: Math.max(a.maxY, b.maxY) };
}

/**
 * Projette l'empreinte + les polygones (Lambert-93) dans une boîte SVG (Y inversé). Empreinte absente/vide → `motif` explicite,
 * on NE dessine PAS au hasard. Un polygone hors empreinte est projeté quand même mais porte `horsEmpreinte` (signalé à l'écran).
 * `cadre` (L5, optionnel) FORCE la bbox de projection : passer le MÊME cadre à deux schémas garantit une échelle/cadrage communs.
 * Sans `cadre`, la bbox est calculée sur les points du schéma (comportement historique inchangé).
 */
export function construireSchema(empreinte: GeomPoly | null, polygones: PolygoneEntreeSchema[], largeur = 320, hauteur = 240, marge = 12, cadre?: Cadre | null): SchemaEmpreinte {
  if (!empreinte || empreinte.anneaux.length === 0) {
    return { largeur, hauteur, empreintePath: null, polygones: [], motif: 'parcelle du permis incomplète ou absente : schéma non dessiné (aucun point fiable)' };
  }
  const boite = cadre ?? cadreDe(empreinte, polygones)!; // empreinte non vide ⇒ cadreDe ≠ null
  const { minX, maxX, minY, maxY } = boite;
  const bw = maxX - minX, bh = maxY - minY;
  if (bw <= 0 || bh <= 0) return { largeur, hauteur, empreintePath: null, polygones: [], motif: 'géométrie dégénérée : schéma non dessiné' };
  const scale = Math.min((largeur - 2 * marge) / bw, (hauteur - 2 * marge) / bh);
  const padX = (largeur - bw * scale) / 2, padY = (hauteur - bh * scale) / 2;
  const proj = (x: number, y: number): [number, number] => [arrondi((x - minX) * scale + padX), arrondi(hauteur - ((y - minY) * scale + padY))]; // Y inversé
  const anneauVersPath = (a: Anneau): string => a.map((pt, i) => `${i === 0 ? 'M' : 'L'}${proj(pt[0], pt[1]).join(',')}`).join(' ') + ' Z';
  const geomVersPath = (g: GeomPoly): string => g.anneaux.map(anneauVersPath).join(' ');
  const centroide = (g: GeomPoly): [number, number] => {
    const a = g.anneaux[0] ?? [];
    if (a.length === 0) return [largeur / 2, hauteur / 2];
    const sx = a.reduce((s, p) => s + p[0], 0) / a.length, sy = a.reduce((s, p) => s + p[1], 0) / a.length;
    return proj(sx, sy);
  };
  return {
    largeur, hauteur, motif: null,
    empreintePath: geomVersPath(empreinte),
    polygones: polygones.map((p) => { const [cx, cy] = centroide(p.geom); return { repere: p.repere, cleabs: p.cleabs, path: geomVersPath(p.geom), cx, cy, horsEmpreinte: p.horsEmpreinte }; }),
  };
}

// ── Exclusivité / cardinalités (pur) ─────────────────────────────────────────
export interface CorpsAffectation { id: number; repere: string | null; altitudeSommetNgf: number | null; nbEtages: number | null; cleabsAffecte: string | null }
export interface PolygoneAffectable { repere: string; cleabs: string | null; horsEmpreinte: boolean }

/** Polygones PROPOSABLES à un corps : ceux qui ne sont PAS affectés à un AUTRE corps (le sien reste proposé → réversibilité). */
export function optionsPourCorps(corps: CorpsAffectation[], polygones: PolygoneAffectable[], corpsId: number): PolygoneAffectable[] {
  const prisAilleurs = new Set(corps.filter((c) => c.id !== corpsId && c.cleabsAffecte).map((c) => c.cleabsAffecte));
  return polygones.filter((p) => p.cleabs !== null && !prisAilleurs.has(p.cleabs));
}

/** Polygones NON affectés à AUCUN corps → à signaler (jamais ignorés). */
export function polygonesNonAffectes(corps: CorpsAffectation[], polygones: PolygoneAffectable[]): PolygoneAffectable[] {
  const affectes = new Set(corps.map((c) => c.cleabsAffecte).filter((x): x is string => !!x));
  return polygones.filter((p) => p.cleabs === null || !affectes.has(p.cleabs));
}

/** Repère du corps auquel un polygone est affecté (pour l'étiquette du schéma / la liste), ou null. */
export function corpsDuPolygone(corps: CorpsAffectation[], cleabs: string | null): CorpsAffectation | null {
  if (!cleabs) return null;
  return corps.find((c) => c.cleabsAffecte === cleabs) ?? null;
}
