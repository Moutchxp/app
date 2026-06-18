-- =====================================================================
-- Bloc B — Schéma PostGIS Sans Vis-à-Vis® (tables vides, sans import)
-- Idempotent : ré-exécutable sans effet de bord (IF NOT EXISTS partout).
-- SRID de travail : Lambert-93 (EPSG:2154), conforme CLAUDE.md §5.
-- Réf : SPEC_module_hauteurs_v3.md (sources de données + cascade hauteur).
-- =====================================================================

-- 1. Extensions ------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_raster;

-- 2. Vecteur — emprises bâtiments BD TOPO® ---------------------------
CREATE TABLE IF NOT EXISTS bdtopo_batiment (
  id                      BIGSERIAL PRIMARY KEY,
  cleabs                  TEXT,                              -- identifiant stable BD TOPO®
  geom                    geometry(MultiPolygon, 2154) NOT NULL,
  hauteur                 DOUBLE PRECISION,                  -- BD TOPO® "hauteur"
  altitude_minimale_sol   DOUBLE PRECISION,                  -- z_min_sol
  altitude_maximale_toit  DOUBLE PRECISION,                  -- z_max_toit (cascade priorité 1)
  nombre_d_etages         INTEGER,
  nature                  TEXT,
  usage_1                 TEXT                               -- résidentiel / bureaux (nuisances)
);

CREATE INDEX IF NOT EXISTS idx_bdtopo_batiment_geom
  ON bdtopo_batiment USING GIST (geom);

COMMENT ON TABLE bdtopo_batiment IS
  'Emprises bâtiments BD TOPO® (L93/2154) : validation du point d''origine (point dans le polygone), fallback hauteur Mode B (cascade z_max_toit > hauteur+z_min_sol > étages×2.90) et masquage de la végétation (hors emprise = non bâti).';

-- 3. Raster — MNT terrain RGE ALTI® (vide, prêt pour raster2pgsql -a) -
CREATE TABLE IF NOT EXISTS rge_alti (
  rid          SERIAL PRIMARY KEY,
  rast         raster,
  nom_fichier  TEXT
);

CREATE INDEX IF NOT EXISTS idx_rge_alti_rast
  ON rge_alti USING GIST (ST_ConvexHull(rast));

COMMENT ON TABLE rge_alti IS
  'MNT terrain RGE ALTI® (L93/2154) : altitude du terrain (altitude_terrain_origine) au point d''origine et sous chaque obstacle. Ne contient pas les bâtiments.';

-- 4. Raster — MNS LiDAR HD « bâti propre » (vide) --------------------
CREATE TABLE IF NOT EXISTS mns_bati_propre (
  rid          SERIAL PRIMARY KEY,
  rast         raster,
  nom_fichier  TEXT
);

CREATE INDEX IF NOT EXISTS idx_mns_bati_propre_rast
  ON mns_bati_propre USING GIST (ST_ConvexHull(rast));

COMMENT ON TABLE mns_bati_propre IS
  'MNS LiDAR HD pré-traité « bâti propre » (L93/2154) : surface des toits nettoyée (pics techniques rabotés, hors-bâti en nodata). Source primaire Mode A des hauteurs de sommet.';

-- 5. Suivi des imports ----------------------------------------------
CREATE TABLE IF NOT EXISTS import_log (
  id           SERIAL PRIMARY KEY,
  table_cible  TEXT,
  source       TEXT,
  emprise      TEXT,
  nb_objets    INTEGER,
  importe_le   TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE import_log IS
  'Journal des imports de données géographiques (table cible, source, emprise, volume).';
