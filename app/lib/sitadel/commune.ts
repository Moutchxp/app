/**
 * Import du référentiel des COMMUNES (chantier S4) — logique PURE et testable (mapping + UPSERT). La source est
 * IGN ADMIN EXPRESS (COG CARTO) via le WFS de la Géoplateforme (`data.geopf.fr`), Licence Ouverte Etalab 2.0 — MÊME
 * hôte que le Plan IGN du certificat, JAMAIS un dérivé OpenStreetMap. Le CLI `app/scripts/commune-import.ts` orchestre
 * le téléchargement ; ce module ne fait ni réseau ni décision de provenance.
 */

/** Couche COMMUNE d'ADMIN EXPRESS (COG CARTO, dernier millésime). La couche COMMUNE donne Paris = 75056 (commune
 *  unique), PAS les arrondissements 751xx → jointure directe avec sitadel_dossier.code_insee. */
export const WFS_COUCHE = 'ADMINEXPRESS-COG-CARTO.LATEST:commune';
export const DEPARTEMENTS = ['75', '92', '93', '78'] as const;
export const SOURCE_COMMUNE = 'IGN ADMIN EXPRESS COG CARTO (data.geopf.fr WFS) — Licence Ouverte Etalab 2.0';
/** Millésime = identifiant de la couche « LATEST » (l'API DiDo/WFS n'expose pas d'année sur la feature). */
export const MILLESIME_COMMUNE = WFS_COUCHE;

/**
 * URL WFS GetFeature (GeoJSON, 4326) des communes des 4 départements. `hits=true` → renvoie seulement le décompte.
 * Encodage `encodeURIComponent` (espaces → `%20`) plutôt que `URLSearchParams` (qui produirait `+`) : c'est la forme
 * vérifiée fonctionnelle contre la Géoplateforme pour un `CQL_FILTER`.
 */
export function urlWfsCommunes(hits = false): string {
  const filtre = `code_insee_du_departement IN (${DEPARTEMENTS.map((d) => `'${d}'`).join(',')})`;
  const params: Record<string, string> = {
    SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature', TYPENAMES: WFS_COUCHE,
    OUTPUTFORMAT: 'application/json', CQL_FILTER: filtre,
  };
  if (hits) params.RESULTTYPE = 'hits';
  const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return `https://data.geopf.fr/wfs/ows?${qs}`;
}

/** Géométrie GeoJSON (Polygon/MultiPolygon) — structure minimale utilisée telle quelle par PostGIS. */
export interface GeoJsonGeometry { type: string; coordinates: unknown }
export interface FeatureCommune {
  properties: { code_insee?: string; nom_officiel?: string; code_insee_du_departement?: string };
  geometry: GeoJsonGeometry | null;
}
export interface CollectionCommunes {
  type?: string;
  numberReturned?: number;
  numberMatched?: number;
  totalFeatures?: number;
  features?: FeatureCommune[];
}

export interface Commune {
  codeInsee: string;
  nom: string;
  departement: string;
  geometrie: GeoJsonGeometry | null;
}

/** Extrait une commune d'une feature ADMIN EXPRESS. Ignore (null) une feature sans code INSEE ou sans nom. */
export function mapFeature(f: FeatureCommune): Commune | null {
  const codeInsee = (f.properties.code_insee ?? '').trim();
  const nom = (f.properties.nom_officiel ?? '').trim();
  const departement = (f.properties.code_insee_du_departement ?? '').trim();
  if (codeInsee === '' || nom === '') return null;
  return { codeInsee, nom, departement, geometrie: f.geometry };
}

/**
 * Un téléchargement est COMPLET si la collection est bien une `FeatureCollection` non vide dont le décompte renvoyé
 * couvre le décompte total (aucune pagination tronquée). Le WFS Géoplateforme renseigne `numberReturned`/`numberMatched`.
 */
export function collectionComplete(c: CollectionCommunes): boolean {
  const features = c.features;
  if (!Array.isArray(features) || features.length === 0) return false;
  const attendu = c.numberMatched ?? c.totalFeatures;
  if (typeof attendu === 'number' && features.length !== attendu) return false;
  return true;
}

/** Fonction de requête minimale (injectable) — compatible avec `query` de `db/client`. */
export type Requete = <R = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<{ rows: R[] }>;

/**
 * UPSERT idempotent d'une commune. Géométrie : GeoJSON (4326, lon/lat) → `ST_SetSRID(…,4326)` → `ST_Transform(…,2154)`
 * → `ST_Force2D` → `ST_Multi` (garantit MultiPolygon). Rejouer avec la même source ne change RIEN (mêmes valeurs
 * réécrites). `xmax = 0` distingue une insertion d'une mise à jour.
 */
export async function upserterCommune(
  q: Requete, c: Commune, source: string, millesime: string,
): Promise<{ nouveau: boolean }> {
  const geojson = c.geometrie ? JSON.stringify(c.geometrie) : null;
  const r = await q<{ est_nouveau: boolean }>(
    `INSERT INTO commune (code_insee, nom, departement, geom, source, millesime)
     VALUES ($1, $2, $3,
       CASE WHEN $4::text IS NULL THEN NULL
            ELSE ST_Multi(ST_Force2D(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), 2154))) END,
       $5, $6)
     ON CONFLICT (code_insee) DO UPDATE SET
       nom = EXCLUDED.nom, departement = EXCLUDED.departement, geom = EXCLUDED.geom,
       source = EXCLUDED.source, millesime = EXCLUDED.millesime
     RETURNING (xmax = 0) AS est_nouveau`,
    [c.codeInsee, c.nom, c.departement, geojson, source, millesime],
  );
  return { nouveau: r.rows[0]?.est_nouveau === true };
}
