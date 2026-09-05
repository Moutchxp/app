/**
 * PL-A — PLANCHE CADASTRALE (LECTURE SEULE). Charge, pour un permis, les parcelles RETENUES (lignes `permis_parcelle` rattachées à
 * `parcelle`) + les parcelles VOISINES dans un RAYON autour de l'empreinte (repérage sur planche), et construit le schéma SVG via le
 * module PUR `affectationSchema` (EPSG:2154, aucune tuile, aucune lib carto). Module PROPRE : n'importe que db/client + le module pur.
 *
 * 🔑 PÉRIMÈTRE DES VOISINES = RAYON autour de l'empreinte (défaut 50 m, ~80 parcelles en tissu parisien, ~1,5 ms). Décision mesurée
 * (LOT PL, recon) : la section cadastrale entière est écartée (Seq Scan ~350 ms, aucune index sur (commune,section), 369 parcelles
 * illisibles). Le rayon s'appuie sur l'index GiST `parcelle_geom_geom_idx` (ST_DWithin → `geom && ST_Expand(ref, rayon)`).
 *
 * ⚠️ Ce module N'ÉCRIT RIEN (le clic « ajouter/retirer une parcelle » est un lot SÉPARÉ, PL-B). Provenance de l'acteur résolue
 * honnêtement (id admin → nom ; sinon valeur brute — cf. `acteurParcelle`), pour ne pas rejouer l'incident « verif-lot101 ».
 */
import { query } from '../db/client';
import { construireSchema, geomDepuisGeoJSON, repereDepuisIndex, type SchemaEmpreinte, type PolygoneEntreeSchema, type GeomPoly } from './affectationSchema';

/** Rayon par défaut (m) et bornes de sécurité (paramètre de CODE à ce stade ; pas de réglage à l'écran). */
export const RAYON_VOISINES_DEFAUT_M = 50;
const RAYON_MIN_M = 10, RAYON_MAX_M = 200;
export function bornerRayon(rayonM: number | null | undefined): number {
  const n = typeof rayonM === 'number' && Number.isFinite(rayonM) ? rayonM : RAYON_VOISINES_DEFAUT_M;
  return Math.min(RAYON_MAX_M, Math.max(RAYON_MIN_M, Math.round(n)));
}

/** Métadonnée d'une parcelle de la planche, PARALLÈLE à `schema.polygones` (même ordre) : la couleur/étiquette vit dans le rendu. */
export interface PlancheParcelleMeta {
  idu: string | null;
  section: string;
  numero: string;
  retenue: boolean;                            // true = parcelle du permis ; false = voisine (contexte)
  origine: 'saisie' | 'extraite' | null;       // renseignée seulement pour une retenue
  surfaceM2: number | null;                     // ST_Area(geom), Lambert-93
  majPar: string | null;                        // auteur BRUT (retenue corrigée/saisie) ; null pour une voisine
  majLe: string | null;                         // horodatage ISO ; null pour une voisine
  acteurNom: string | null;                     // prénom+nom si maj_par = id admin résolu ; null sinon
}

export interface PlancheParcelles {
  schema: SchemaEmpreinte;      // empreinte (fond) + polygones projetés (paths SVG) — module pur
  meta: PlancheParcelleMeta[];  // parallèle à schema.polygones
  rayonM: number;               // rayon effectif (borné)
  nbRetenues: number;
  nbVoisines: number;
  motif: string | null;         // si rien à dessiner (aucune parcelle du permis rattachée à un contour) — jamais un cadre vide muet
}

interface LignePlanche {
  idu: string | null; section: string; numero: string; gj: unknown; origine: 'saisie' | 'extraite' | null;
  maj_par: string | null; maj_le: string | null; prenom: string | null; nom: string | null; retenue: boolean; surface_m2: string | number | null;
}

const nbOuNull = (v: string | number | null): number | null => (v === null || v === undefined ? null : Number(v));

/**
 * Parcelles du permis + voisines (rayon) d'un dossier, prêtes à dessiner. LECTURE SEULE. Ordre déterministe (retenues d'abord, puis
 * haut→bas, gauche→droite, idu) → repères A/B/C… stables. Le rayon s'appuie sur `permis_empreinte.geom` (repli : union des parcelles
 * du permis rattachées) comme géométrie de référence — ST_DWithin JOIN, l'index GiST tient (cf. AGENTS.md : un DWithin n'est pas un KNN).
 */
export async function parcellesVoisines(dossierId: number, rayonM: number = RAYON_VOISINES_DEFAUT_M): Promise<PlancheParcelles> {
  const rayon = bornerRayon(rayonM);

  // Empreinte du permis (fond du schéma), en Lambert-93 natif (aucune reprojection — le module pur travaille en 2154).
  const { rows: empRows } = await query<{ gj: unknown }>(
    `SELECT ST_AsGeoJSON(ST_Force2D(geom))::json AS gj FROM permis_empreinte WHERE dossier_id = $1 AND geom IS NOT NULL`, [dossierId]);
  const empGeom: GeomPoly | null = empRows[0]?.gj ? geomDepuisGeoJSON(empRows[0].gj) : null;

  // Retenues (rattachées à `parcelle`) + voisines (rayon). L'auteur d'une retenue est résolu en nom si maj_par est un id admin.
  const { rows } = await query<LignePlanche>(
    `WITH ref AS (
       SELECT COALESCE(
         (SELECT geom FROM permis_empreinte WHERE dossier_id = $1 AND geom IS NOT NULL),
         (SELECT ST_Collect(par.geom) FROM permis_parcelle pp JOIN parcelle par ON par.id = pp.idu WHERE pp.dossier_id = $1)
       ) AS g
     ),
     ret AS (
       SELECT par.id AS idu, par.section, par.numero, ST_Force2D(par.geom) AS geom, pp.origine,
              pp.maj_par, pp.maj_le::text AS maj_le, au.prenom, au.nom, TRUE AS retenue
         FROM permis_parcelle pp
         JOIN parcelle par ON par.id = pp.idu
         LEFT JOIN admin_utilisateur au ON au.id = CASE WHEN pp.maj_par ~ '^[0-9]+$' THEN pp.maj_par::bigint ELSE NULL END
        WHERE pp.dossier_id = $1
     ),
     vois AS (
       SELECT p.id AS idu, p.section, p.numero, ST_Force2D(p.geom) AS geom, NULL::text AS origine,
              NULL::text AS maj_par, NULL::text AS maj_le, NULL::text AS prenom, NULL::text AS nom, FALSE AS retenue
         FROM parcelle p, ref
        WHERE ref.g IS NOT NULL AND ST_DWithin(p.geom, ref.g, $2) AND p.id NOT IN (SELECT idu FROM ret)
     )
     SELECT u.idu, u.section, u.numero, ST_AsGeoJSON(u.geom)::json AS gj, u.origine, u.maj_par, u.maj_le,
            u.prenom, u.nom, u.retenue, round(ST_Area(u.geom)::numeric, 1) AS surface_m2
       FROM (SELECT * FROM ret UNION ALL SELECT * FROM vois) u
      ORDER BY u.retenue DESC, ST_Y(ST_Centroid(u.geom)) DESC, ST_X(ST_Centroid(u.geom)), u.idu`,
    [dossierId, rayon]);

  const meta: PlancheParcelleMeta[] = rows.map((r) => ({
    idu: r.idu, section: r.section, numero: r.numero, retenue: r.retenue === true,
    origine: r.origine, surfaceM2: nbOuNull(r.surface_m2), majPar: r.maj_par, majLe: r.maj_le,
    acteurNom: r.prenom || r.nom ? `${r.prenom ?? ''} ${r.nom ?? ''}`.trim() : null,
  }));
  const entrees: PolygoneEntreeSchema[] = rows.map((r, i) => ({
    repere: repereDepuisIndex(i), cleabs: r.idu, geom: geomDepuisGeoJSON(r.gj), horsEmpreinte: r.retenue !== true,
    attributs: { nombreEtages: null, hauteurM: null, altitudeToitNgf: null, surfaceM2: nbOuNull(r.surface_m2), etatDeLObjet: null },
  }));

  const nbRetenues = meta.filter((m) => m.retenue).length;
  const nbVoisines = meta.length - nbRetenues;
  // HONNÊTETÉ (piège LOT 71) : aucune parcelle du permis rattachée à un contour → rien à cadrer → on DIT pourquoi, jamais un cadre vide.
  const motif = nbRetenues === 0
    ? 'aucune parcelle de ce permis n’est rattachée à un contour cadastral : planche non dessinée (rattachez d’abord une parcelle)'
    : null;

  return { schema: construireSchema(empGeom, entrees, 360, 300, 14), meta, rayonM: rayon, nbRetenues, nbVoisines, motif };
}
