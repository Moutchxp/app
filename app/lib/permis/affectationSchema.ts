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

/**
 * Projette l'empreinte + les polygones (Lambert-93) dans une boîte SVG (Y inversé). Empreinte absente/vide → `motif` explicite,
 * on NE dessine PAS au hasard. Un polygone hors empreinte est projeté quand même mais porte `horsEmpreinte` (signalé à l'écran).
 */
export function construireSchema(empreinte: GeomPoly | null, polygones: PolygoneEntreeSchema[], largeur = 320, hauteur = 240, marge = 12): SchemaEmpreinte {
  if (!empreinte || empreinte.anneaux.length === 0) {
    return { largeur, hauteur, empreintePath: null, polygones: [], motif: 'empreinte incomplète ou absente : schéma non dessiné (aucun point fiable)' };
  }
  const pts: [number, number][] = [...empreinte.anneaux.flat(), ...polygones.flatMap((p) => p.geom.anneaux.flat())];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
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
