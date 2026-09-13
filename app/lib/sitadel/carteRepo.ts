/**
 * Accès données (LECTURE SEULE) de la carte de sélection (chantier S6). Deux lectures : le RÉFÉRENTIEL léger (codes +
 * noms + fusions, pour le multi-sélecteur) et les GÉOMÉTRIES simplifiées (pour le SVG). N'écrit rien.
 */
import { query } from '../db/client';
import { type Bbox, TOLERANCE_SIMPLIFICATION_M } from './carteProjection';

export interface CommuneRef { code: string; nom: string; dep: string }
export interface FusionRef { ancien: string; actuel: string; nomAncien: string | null }
/** `canal` = mairie_contact.canal BRUT (jamais mappé ici) : le client dérive le rail via `processDeCanal` (SOURCE UNIQUE). null = aucun contact. */
export interface CommuneGeo extends CommuneRef { anneaux: [number, number][][]; canal: string | null }

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
  // canal joint DEPUIS mairie_contact (LEFT JOIN 1:1 sur code_insee → n'ajoute aucune ligne, la fenêtre ST_CoverageSimplify OVER () reste
  //   sur le jeu complet des communes). Le canal est renvoyé BRUT ; le rail (email/formulaire/hors-process) est dérivé côté client par processDeCanal.
  const r = await query<{ code: string; nom: string; dep: string; gj: string; canal: string | null }>(
    `SELECT code_insee AS code, nom, departement AS dep, canal,
            ST_AsGeoJSON(g, 0) AS gj
     FROM (SELECT c.code_insee, c.nom, c.departement, mc.canal, ST_CoverageSimplify(c.geom, $1) OVER () AS g
             FROM commune c LEFT JOIN mairie_contact mc ON mc.code_insee = c.code_insee) s
     ORDER BY departement, code_insee`,
    [TOLERANCE_SIMPLIFICATION_M],
  );
  const communes: CommuneGeo[] = r.rows.map((x) => ({
    code: x.code, nom: x.nom, dep: x.dep, anneaux: anneauxExterieurs(JSON.parse(x.gj) as GeoJsonGeom), canal: x.canal ?? null,
  }));
  const e = await query<{ xmin: number; ymin: number; xmax: number; ymax: number }>(
    `SELECT ST_XMin(e) xmin, ST_YMin(e) ymin, ST_XMax(e) xmax, ST_YMax(e) ymax FROM (SELECT ST_Extent(geom) e FROM commune) t`,
  );
  const b = e.rows[0];
  return { communes, bbox: [b.xmin, b.ymin, b.xmax, b.ymax] };
}
