-- Migration 011 — Élargit le CHECK action de curation_patrimoine_log
-- Ajoute 3 valeurs : creation_entite_manuelle, suppression_entite_manuelle, renommage
-- Additif / non destructif : relâche puis reforme la contrainte CHECK (aucune donnée touchée).
-- Idempotent : rejouable ; drop de la contrainte action existante par introspection (nom auto ou explicite).
-- Golden-safe : le journal n'est jamais lu par le moteur (faisceaux/verdict/pipeline de score).
-- Application locale : psql "$DATABASE_URL" -f db/migrations/011_check_action_journal.sql

DO $$
DECLARE
  c_name text;
BEGIN
  -- Retire toute contrainte CHECK portant sur la colonne action (robuste au nom réel)
  FOR c_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'curation_patrimoine_log'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%action%'
  LOOP
    EXECUTE format('ALTER TABLE curation_patrimoine_log DROP CONSTRAINT %I', c_name);
  END LOOP;

  ALTER TABLE curation_patrimoine_log
    ADD CONSTRAINT curation_patrimoine_log_action_check
    CHECK (action IN (
      'deplacement',
      'annulation_deplacement',
      'rattachement',
      'detachement',
      'verification',
      'creation_entite_manuelle',
      'suppression_entite_manuelle',
      'renommage'
    ));
END $$;
