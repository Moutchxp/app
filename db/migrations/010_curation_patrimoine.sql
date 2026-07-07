-- 010_curation_patrimoine.sql — Carte de curation patrimoine (M4).
--
-- ADDITIVE / IDEMPOTENTE / NON DESTRUCTIVE : ADD COLUMN IF NOT EXISTS + CREATE TABLE IF NOT EXISTS.
-- Aucune opération sur les 4 tables sources patrimoine ni sur le seed 009. Géométries en 2154
-- (jamais reprojetées en base ; affichage Leaflet = ST_Transform(...,4326) côté requête).
-- Application manuelle : psql "$DATABASE_URL" -f db/migrations/010_curation_patrimoine.sql

-- Déplacement RÉVERSIBLE : la correction manuelle vit dans une colonne DÉDIÉE ; le geom_point ORIGINAL
-- n'est JAMAIS muté. Point effectif = COALESCE(geom_point_corrige, geom_point). « Annuler » = mettre NULL.
ALTER TABLE patrimoine_entite
  ADD COLUMN IF NOT EXISTS geom_point_corrige geometry(Point,2154);

-- Détachement DURABLE (tombstone) d'une liaison auto détachée à la main ; défaut false → GOLDEN-SAFE
-- (le moteur ajoute `AND NOT peb.detache` : sans tombstone, comportement identique à l'existant).
ALTER TABLE patrimoine_entite_batiment
  ADD COLUMN IF NOT EXISTS detache boolean NOT NULL DEFAULT false;

-- Journal dédié de curation, append-only, SÉPARÉ de config_edit_log (OQ-C).
CREATE TABLE IF NOT EXISTS curation_patrimoine_log (
  id        bigserial   PRIMARY KEY,
  ts        timestamptz NOT NULL DEFAULT now(),
  action    text        NOT NULL CHECK (action IN
              ('deplacement','annulation_deplacement','rattachement','detachement','verification')),
  entite_id integer     NOT NULL,
  cleabs    text,                    -- null pour un (dé)placement de point
  avant     jsonb,
  apres     jsonb
);
CREATE INDEX IF NOT EXISTS curation_patrimoine_log_entite_idx ON curation_patrimoine_log (entite_id);
