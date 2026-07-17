-- 042_cycle_vie_retrait_consentement.sql — Module INTERNAUTE : autorise l'action 'retrait_consentement' au journal.
--
-- MOTIF : le retrait de consentement (voies HORS tunnel : page admin, lien e-mail) écrit une entrée d'accountability
-- dans `internaute_cycle_vie_log`. Son CHECK `action` (migration 025) n'admet que 'effacement'|'rectification'|
-- 'purge_auto' → il faut l'ÉLARGIR à 'retrait_consentement'. Même pattern que 011/012 (drop robuste par introspection
-- pg_constraint + re-add). Aucune migration côté `internaute_consentement.canal` : cette colonne est `text` SANS CHECK
-- (023), donc `canal='admin'` est déjà accepté tel quel.
--
-- SÛR : DDL uniquement (contrainte), AUCUNE écriture de données, AUCUN DROP de table/colonne. Idempotent par nature
-- (drop-then-add). Application locale : psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/042_cycle_vie_retrait_consentement.sql
-- Vérification : SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--                WHERE conrelid = 'internaute_cycle_vie_log'::regclass AND contype = 'c';

BEGIN;

DO $$
DECLARE c_name text;
BEGIN
  -- Retire toute contrainte CHECK portant sur `action` (robuste au nom réel de la contrainte).
  FOR c_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'internaute_cycle_vie_log'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%action%'
  LOOP
    EXECUTE format('ALTER TABLE internaute_cycle_vie_log DROP CONSTRAINT %I', c_name);
  END LOOP;

  ALTER TABLE internaute_cycle_vie_log
    ADD CONSTRAINT internaute_cycle_vie_log_action_check
    CHECK (action IN (
      'effacement',
      'rectification',
      'purge_auto',
      'retrait_consentement'
    ));
END $$;

COMMIT;
