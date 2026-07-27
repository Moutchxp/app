/**
 * Accès données (LECTURE SEULE) de la carte de sélection (chantier S6). Deux lectures : le RÉFÉRENTIEL léger (codes +
 * noms + fusions, pour le multi-sélecteur) et les GÉOMÉTRIES simplifiées (pour le SVG). N'écrit rien.
 */
import { query } from '../db/client';
import { type Bbox, TOLERANCE_SIMPLIFICATION_M } from './carteProjection';

export interface CommuneRef { code: string; nom: string; dep: string }
export interface FusionRef { ancien: string; actuel: string; nomAncien: string | null }
export interface CommuneGeo extends CommuneRef { anneaux: [number, number][][] }

/** Référentiel léger (sans géométrie) pour le multi-sélecteur + la table des fusions (avertissement d'inclusion). */
export async function lireReferentielCommunes(): Promise<{ communes: CommuneRef[]; fusions: FusionRef[] }> {
  const [c, f] = await Promise.all([
    query<{ code: string; nom: string; dep: string }>(
      `SELECT code_insee AS code, nom, departement AS dep FROM commune ORDER BY departement, nom`,
    ),
    query<{ ancien: string; actuel: string; nom_ancien: string | null }>(
      `SELECT ancien_code AS ancien, code_actuel AS actuel, nom_ancien FROM commune_fusion`,
    ),
  ]);
  return { communes: c.rows, fusions: f.rows.map((x) => ({ ancien: x.ancien, actuel: x.actuel, nomAncien: x.nom_ancien })) };
}

interface GeoJsonGeom { type: string; coordinates: unknown }
/** Extrait les anneaux EXTÉRIEURS (Polygon/MultiPolygon) en [x,y] L93. Les trous sont ignorés (remplissage d'aperçu). */
function anneauxExterieurs(g: GeoJsonGeom): [number, number][][] {
  const asRing = (r: unknown): [number, number][] => (r as [number, number][]);
  if (g.type === 'Polygon') { const c = g.coordinates as unknown[]; return c.length ? [asRing(c[0])] : []; }
  if (g.type === 'MultiPolygon') { return (g.coordinates as unknown[][]).map((poly) => asRing(poly[0])).filter(Boolean); }
  return [];
}

/**
 * Géométries des 335 communes, simplifiées EN COUVERTURE (`ST_CoverageSimplify` OVER () → bords partagés préservés),
 * en Lambert-93 (aucune reprojection), + bbox globale. Une seule charge utile, servie à l'ouverture de la carte.
 */
export async function lireCarteCommunes(): Promise<{ communes: CommuneGeo[]; bbox: Bbox }> {
  const r = await query<{ code: string; nom: string; dep: string; gj: string }>(
    `SELECT code_insee AS code, nom, departement AS dep,
            ST_AsGeoJSON(g, 0) AS gj
     FROM (SELECT code_insee, nom, departement, ST_CoverageSimplify(geom, $1) OVER () AS g FROM commune) s
     ORDER BY departement, code_insee`,
    [TOLERANCE_SIMPLIFICATION_M],
  );
  const communes: CommuneGeo[] = r.rows.map((x) => ({
    code: x.code, nom: x.nom, dep: x.dep, anneaux: anneauxExterieurs(JSON.parse(x.gj) as GeoJsonGeom),
  }));
  const e = await query<{ xmin: number; ymin: number; xmax: number; ymax: number }>(
    `SELECT ST_XMin(e) xmin, ST_YMin(e) ymin, ST_XMax(e) xmax, ST_YMax(e) ymax FROM (SELECT ST_Extent(geom) e FROM commune) t`,
  );
  const b = e.rows[0];
  return { communes, bbox: [b.xmin, b.ymin, b.xmax, b.ymax] };
}
