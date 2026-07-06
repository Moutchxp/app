-- =====================================================================
-- 004 — CREATE TABLE config_edit_log (journal d'écriture de config_scoring)
--
-- CONTEXTE (M1 — édition de config_scoring depuis l'admin) : chaque écriture
-- admin sur le singleton `config_scoring` (id=1) consigne ici une entrée
-- minimale (horodatage / colonne / valeur avant → après). Journal purement
-- APPEND-ONLY : aucun versioning, aucun rollback, aucune donnée personnelle.
--
-- IDEMPOTENTE & NON DESTRUCTIVE : `CREATE TABLE IF NOT EXISTS` seul. Aucun
-- DROP / DELETE / TRUNCATE / ALTER, aucune modification d'une table existante.
-- Sur une base où la table existe déjà, cette migration est un NO-OP.
--
-- Application (manuelle, hors staging automatique) :
--   psql "$DATABASE_URL" -f db/migrations/004_config_edit_log.sql
-- =====================================================================

CREATE TABLE IF NOT EXISTS config_edit_log (
  id      bigserial   PRIMARY KEY,
  ts      timestamptz NOT NULL DEFAULT now(),
  colonne text        NOT NULL,
  avant   text,
  apres   text
);
