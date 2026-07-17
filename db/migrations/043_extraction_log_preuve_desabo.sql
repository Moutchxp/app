-- 043_extraction_log_preuve_desabo.sql — Module INTERNAUTE : autorise l'action 'export_preuve_desabo' au journal d'extraction.
--
-- MOTIF : le DOSSIER DE PREUVE des désabonnements (accountability RGPD) est une extraction DISTINCTE de l'export
-- commercial — un auditeur doit pouvoir les séparer dans `internaute_extraction_log`. Son CHECK `action` (migration 024)
-- n'admet que 'export_csv' | 'acces_profil' → il faut l'ÉLARGIR à 'export_preuve_desabo'. Même pattern que 011/012/042
-- (drop robuste par introspection pg_constraint + re-add). Aucune autre modification ; aucune migration côté
-- `internaute_consentement` (la requête du dossier est en LECTURE SEULE).
--
-- SÛR : DDL uniquement (contrainte), AUCUNE écriture de données, AUCUN DROP de table/colonne. Idempotent (drop-then-add).
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/043_extraction_log_preuve_desabo.sql
-- Vérification : SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--                WHERE conrelid = 'internaute_extraction_log'::regclass AND contype = 'c';

BEGIN;

DO $$
DECLARE c_name text;
BEGIN
  -- Retire toute contrainte CHECK portant sur `action` (robuste au nom réel de la contrainte).
  FOR c_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'internaute_extraction_log'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%action%'
  LOOP
    EXECUTE format('ALTER TABLE internaute_extraction_log DROP CONSTRAINT %I', c_name);
  END LOOP;

  ALTER TABLE internaute_extraction_log
    ADD CONSTRAINT internaute_extraction_log_action_check
    CHECK (action IN (
      'export_csv',
      'acces_profil',
      'export_preuve_desabo'
    ));
END $$;

COMMIT;
