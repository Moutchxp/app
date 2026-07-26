-- 049_commune.sql — Module VEILLE PERMIS (chantier S4) : référentiel des COMMUNES (nom + contour).
--
-- MOTIF : la tuile « Permis de construire » n'affiche aujourd'hui que le code INSEE. Ce référentiel donne le NOM de
-- commune (affichage « Nom (code) », recherche par nom) et le CONTOUR (usage géographique futur). Alimenté depuis
-- IGN ADMIN EXPRESS (COG CARTO), Licence Ouverte Etalab 2.0 — MÊME famille de source que le Plan IGN du certificat.
-- ⚠️ JAMAIS un jeu dérivé d'OpenStreetMap (ODbL, partage à l'identique incompatible commercial — cf.
-- docs/FRAICHEUR_CONTROLE_MIXTE_ET_PERMIS.md §OSM).
--
-- SRID 2154 (Lambert-93), comme tout le reste de la base. `ST_Force2D` à l'import (cohérent avec batiment/parcelle).
-- Ce chantier LIT sitadel_dossier ; il n'y touche pas. GOLDEN-SAFE : aucun contact moteur/config_scoring/batiment.
--
-- RECHERCHE PAR NOM insensible à la CASSE et aux ACCENTS : index GIN trigramme sur `lower(unaccent(nom))`. `unaccent()`
-- étant STABLE (pas IMMUTABLE), on passe par un wrapper IMMUTABLE (`svv_unaccent_immutable`, forme à dictionnaire figé)
-- pour pouvoir l'indexer. La MÊME expression est utilisée à la requête → l'index est bien exploité.
--
-- SÛR : DDL uniquement (aucune écriture de données ici — l'import est fait par `app/scripts/commune-import.ts`).
-- Idempotent (IF NOT EXISTS + CREATE OR REPLACE). Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/049_commune.sql
-- Vérification : \d commune

BEGIN;

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Wrapper IMMUTABLE d'unaccent (dictionnaire figé) → indexable. Utilisé par l'index de nom ET par la requête de filtre.
CREATE OR REPLACE FUNCTION svv_unaccent_immutable(text)
  RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

CREATE TABLE IF NOT EXISTS commune (
  code_insee  char(5) PRIMARY KEY,                        -- code Sitadel-compatible (Paris = commune unique 75056)
  nom         text NOT NULL,                              -- nom officiel (ADMIN EXPRESS `nom_officiel`)
  departement char(2) NOT NULL,
  geom        geometry(MultiPolygon, 2154),               -- contour, Lambert-93, 2D (ST_Force2D à l'import)
  source      text,                                       -- provenance (obligation Etalab)
  millesime   text                                        -- version du référentiel (obligation Etalab : date/version)
);

COMMENT ON TABLE commune IS 'Référentiel des communes (nom + contour), IGN ADMIN EXPRESS COG CARTO (Etalab 2.0). Paris = 75056 (commune unique), JAMAIS les arrondissements 751xx — aligné sur sitadel_dossier.code_insee.';
COMMENT ON COLUMN commune.code_insee IS 'Code INSEE de commune. Paris = 75056 (couche COMMUNE d''ADMIN EXPRESS, pas les arrondissements) → jointure directe avec sitadel_dossier.';

CREATE INDEX IF NOT EXISTS commune_departement_idx ON commune (departement);
CREATE INDEX IF NOT EXISTS commune_geom_gist        ON commune USING gist (geom);
-- Recherche par nom insensible casse + accents (trigramme sur lower(unaccent(nom))).
CREATE INDEX IF NOT EXISTS commune_nom_trgm_idx     ON commune USING gin (lower(svv_unaccent_immutable(nom)) gin_trgm_ops);

COMMIT;
