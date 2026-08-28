-- 165_permis_polygone_statut_origine.sql — RATT-2 : distinguer l'ORIGINE d'une ligne de statut (saisie humaine vs automatisme).
--
-- POURQUOI : RATT-2 pose un statut « détruit » D'OFFICE sur un bâtiment recouvert par l'emprise projetée. Il faut pouvoir dire, dans
-- le registre de preuve, qu'une ligne vient d'un AUTOMATISME (recouvrement / révocation auto) et non d'une décision d'Arno — sinon
-- l'automatisme ne saurait pas révoquer SES propres lignes sans risquer d'écraser une décision humaine. La colonne rend cette
-- distinction LISIBLE et OPPOSABLE, sans jamais toucher la source BD TOPO.
--
-- 🔴 APPEND-ONLY INTACT : cette colonne s'ajoute par DDL (ALTER TABLE), pas par UPDATE de lignes → le trigger append-only de la 164
-- (BEFORE UPDATE/DELETE/TRUNCATE) n'est PAS déclenché (le DEFAULT constant est métadonnée-only en PostgreSQL 11+, aucune réécriture de
-- ligne). La révocation d'un statut auto reste, comme le reste, une NOUVELLE ligne (statut 'revoque', origine 'auto_revocation').
--
-- SÛR : DDL strictement ADDITIVE (ADD COLUMN IF NOT EXISTS ; ADD CONSTRAINT gardé par un DO idempotent ; COMMENT). Aucune colonne
-- existante touchée, aucune ligne réécrite. NE touche NI le moteur de verdict SVAV NI le golden. Idempotente. Un seul BEGIN/COMMIT.
-- Requiert `permis_polygone_statut` (migration 164). Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/165_permis_polygone_statut_origine.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS.

BEGIN;

-- ORIGINE d'une ligne : saisie (décision d'Arno) | auto_recouvrement ('détruit' d'office car recouvert) | auto_revocation (l'auto
--   défait SA propre décision quand le polygone n'est plus recouvert). DEFAULT 'saisie' → les lignes existantes (toutes humaines) le restent.
ALTER TABLE permis_polygone_statut ADD COLUMN IF NOT EXISTS origine text NOT NULL DEFAULT 'saisie';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'permis_polygone_statut_origine_chk') THEN
    ALTER TABLE permis_polygone_statut
      ADD CONSTRAINT permis_polygone_statut_origine_chk CHECK (origine IN ('saisie','auto_recouvrement','auto_revocation'));
  END IF;
END $$;

COMMENT ON COLUMN permis_polygone_statut.origine IS 'RATT-2 — origine de la ligne (liste FERMÉE) : saisie (décision humaine d''Arno) | auto_recouvrement (''detruit'' posé d''office parce que le polygone est recouvert par l''emprise projetée) | auto_revocation (l''automatisme défait SA PROPRE décision quand le polygone n''est plus recouvert). 🔴 L''automatisme ne révoque QUE des lignes ''auto_recouvrement'' ; une décision ''saisie'' n''est JAMAIS écrasée ni révoquée par l''auto. « detruit » reste une PRÉVISION, à confronter à la mise à jour cadastrale.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (S'EXÉCUTE quand tu lances le fichier — AFFICHE le résultat) :
\echo '>>> colonne origine + son défaut + NOT NULL :'
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_name = 'permis_polygone_statut' AND column_name = 'origine';
\echo '>>> CHECK origine (liste fermée) :'
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'permis_polygone_statut_origine_chk';
\echo '>>> répartition des origines existantes (toutes attendues en ''saisie'' après bascule du défaut) :'
SELECT origine, count(*) FROM permis_polygone_statut GROUP BY origine ORDER BY origine;
