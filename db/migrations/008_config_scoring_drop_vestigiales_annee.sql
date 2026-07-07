-- 008_config_scoring_drop_vestigiales_annee.sql
-- PURGE DESTRUCTIVE (assumée, pré-approuvée) des 8 colonnes de barème par année NEUTRALISÉES au
-- chantier « cartes d'année dynamiques » : le barème par tranche d'année est désormais piloté par
-- la table `config_famille_annee` (migrations 006/007).
--
-- Ces colonnes n'étaient plus lues par le moteur (`profilConfig.ts` / `coucheDegagement.ts`) — elles
-- n'apparaissaient qu'en affichage VESTIGIALE (Pilotage). Le golden lit `PROFIL_GOLDEN_REF` (fixture
-- gelée, sans ces champs) → ce DROP NE bouge PAS le golden.
--
-- `config_scoring` passe de 47 à 39 colonnes. `DROP COLUMN IF EXISTS` → IDEMPOTENT (rejouable NO-OP).
-- AUCUNE AUTRE colonne touchée. Aucune donnée d'une colonne vivante supprimée.
-- Application manuelle : psql "$DATABASE_URL" -f db/migrations/008_config_scoring_drop_vestigiales_annee.sql

ALTER TABLE config_scoring DROP COLUMN IF EXISTS a1900_cone;
ALTER TABLE config_scoring DROP COLUMN IF EXISTS a1900_flanc;
ALTER TABLE config_scoring DROP COLUMN IF EXISTS a1900_distmax_m;
ALTER TABLE config_scoring DROP COLUMN IF EXISTS a1935_cone;
ALTER TABLE config_scoring DROP COLUMN IF EXISTS a1935_flanc;
ALTER TABLE config_scoring DROP COLUMN IF EXISTS a1935_distmax_m;
ALTER TABLE config_scoring DROP COLUMN IF EXISTS borne_annee_1900;
ALTER TABLE config_scoring DROP COLUMN IF EXISTS borne_annee_1935;
