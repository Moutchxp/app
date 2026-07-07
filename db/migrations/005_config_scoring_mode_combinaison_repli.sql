-- 005_config_scoring_mode_combinaison_repli.sql
-- Ajoute la colonne `mode_combinaison_repli` : mode de combinaison nature (P1) + bâti (P2)
-- appliqué QUAND natureM < cumul_seuil_min_m (sous le seuil de nature). Liste fermée {max, addition}.
--
-- MIGRATION ADDITIVE, IDEMPOTENTE, NON DESTRUCTIVE :
--   - ADD COLUMN IF NOT EXISTS (rejouable en NO-OP) ; les lignes existantes reçoivent 'addition'.
--   - AUCUN UPDATE de `mode_combinaison` : la valeur LIVE (aujourd'hui 'max') est régularisée par
--     Arno via l'admin après le build (cf. SPEC_modes_combinaison.md, EX-21 — Règle dure).
--   - Aucun DROP/ALTER destructif.
-- Application manuelle : psql "$DATABASE_URL" -f db/migrations/005_config_scoring_mode_combinaison_repli.sql

ALTER TABLE config_scoring
  ADD COLUMN IF NOT EXISTS mode_combinaison_repli text NOT NULL DEFAULT 'addition';

-- CHECK idempotent (PostgreSQL n'a pas d'ADD CONSTRAINT IF NOT EXISTS) :
DO $$ BEGIN
  ALTER TABLE config_scoring
    ADD CONSTRAINT config_scoring_mode_combinaison_repli_check
    CHECK (mode_combinaison_repli IN ('max', 'addition'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
