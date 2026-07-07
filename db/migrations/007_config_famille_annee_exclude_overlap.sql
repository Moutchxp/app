-- 007_config_famille_annee_exclude_overlap.sql
-- Filet de DERNIER RECOURS (concurrence) contre le CHEVAUCHEMENT des cartes d'année.
--
-- La validation applicative (`validerCartesAnnee`, cartesAnnee.ts) reste la PREMIÈRE défense
-- (message clair, 422). Cette contrainte EXCLUDE bloque en plus les écritures CONCURRENTES qui
-- passeraient toutes deux la validation applicative (TOCTOU).
--
-- SÉMANTIQUE IDENTIQUE à `intervalleReelCarte` (source unique) — intervalle réel ENTIER inclusif :
--   lo = borne_min NULL ? −∞ : (op_min='>=' ? borne_min : borne_min+1)
--   hi = borne_max NULL ? +∞ : (op_max='<=' ? borne_max : borne_max−1)
--   → int4range(lo, hi, '[]')  (NULL = borne infinie). Chevauchement = opérateur && sur les ranges.
--
-- ADDITIVE, IDEMPOTENTE, NON DESTRUCTIVE : aucun DROP/ALTER destructif, aucune donnée modifiée.
-- Le GiST sur les types range est NATIF (range_ops) → AUCUNE extension requise (pas de btree_gist :
-- l'exclusion ne mêle aucune colonne d'égalité). `ADD CONSTRAINT ... EXCLUDE` n'a pas de variante
-- `IF NOT EXISTS` → idempotence via un DO block testant `pg_constraint`.
-- Application manuelle : psql "$DATABASE_URL" -f db/migrations/007_config_famille_annee_exclude_overlap.sql

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'config_famille_annee_no_overlap'
      AND conrelid = 'config_famille_annee'::regclass
  ) THEN
    ALTER TABLE config_famille_annee
      ADD CONSTRAINT config_famille_annee_no_overlap
      EXCLUDE USING gist (
        int4range(
          CASE WHEN borne_min IS NULL THEN NULL
               ELSE (CASE WHEN op_min = '>=' THEN borne_min ELSE borne_min + 1 END) END,
          CASE WHEN borne_max IS NULL THEN NULL
               ELSE (CASE WHEN op_max = '<=' THEN borne_max ELSE borne_max - 1 END) END,
          '[]'
        ) WITH &&
      );
  END IF;
END $$;
