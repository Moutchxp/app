-- =============================================================================
-- migration_config_scoring_orientation_annee_portee.sql
-- Externalisation NEUTRE (refactor) de 3 groupes de constantes vers config_scoring :
--   A. ORIENTATION_PTS       → orientation_n..orientation_no  (barème 0..10, 8 secteurs)
--   B. Bornes d'année        → borne_annee_1900 / borne_annee_1935
--   C. Portée d'analyse       → analysis_range_m
-- Idempotent (ADD COLUMN IF NOT EXISTS) et rejouable. Les VALEURS sont identiques à
-- l'existant → aucun changement de comportement (golden Asnières inchangé).
-- =============================================================================

-- A. Barème d'orientation (points par secteur, 0..10) — cf. config.ts ORIENTATION_PTS.
ALTER TABLE config_scoring ADD COLUMN IF NOT EXISTS orientation_n  double precision NOT NULL DEFAULT 0;
ALTER TABLE config_scoring ADD COLUMN IF NOT EXISTS orientation_ne double precision NOT NULL DEFAULT 1;
ALTER TABLE config_scoring ADD COLUMN IF NOT EXISTS orientation_e  double precision NOT NULL DEFAULT 5;
ALTER TABLE config_scoring ADD COLUMN IF NOT EXISTS orientation_se double precision NOT NULL DEFAULT 8;
ALTER TABLE config_scoring ADD COLUMN IF NOT EXISTS orientation_s  double precision NOT NULL DEFAULT 10;
ALTER TABLE config_scoring ADD COLUMN IF NOT EXISTS orientation_so double precision NOT NULL DEFAULT 9;
ALTER TABLE config_scoring ADD COLUMN IF NOT EXISTS orientation_o  double precision NOT NULL DEFAULT 7;
ALTER TABLE config_scoring ADD COLUMN IF NOT EXISTS orientation_no double precision NOT NULL DEFAULT 3;

-- B. Bornes des familles année (≤1900 et 1901–1935) — cf. coucheDegagement.ts familleCoeff.
ALTER TABLE config_scoring ADD COLUMN IF NOT EXISTS borne_annee_1900 integer NOT NULL DEFAULT 1900;
ALTER TABLE config_scoring ADD COLUMN IF NOT EXISTS borne_annee_1935 integer NOT NULL DEFAULT 1935;

-- C. Portée d'analyse (m) — miroir de ANALYSIS_RANGE_M (reste exporté en code).
ALTER TABLE config_scoring ADD COLUMN IF NOT EXISTS analysis_range_m integer NOT NULL DEFAULT 200;
