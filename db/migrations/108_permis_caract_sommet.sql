-- 108_permis_caract_sommet.sql — Module VEILLE PERMIS (chantier N8-B) : altitude de SOMMET au niveau PERMIS.
-- ⚠️ POURQUOI : quand un permis a plusieurs corps de bâtiment, la cote la plus haute des planches (l'acrotère max) n'est PAS
-- rattachable à un corps précis (attribution par lot non établie — cf. P4/P5). Elle doit donc vivre au niveau PERMIS, distincte
-- de la colonne homonyme de permis_corps_batiment (qui reste, elle, une valeur PAR corps). Mêmes CHECK/bornes que la colonne du
-- corps ([-50 ; 500] ; origine 'saisie'|'extraite').
--
-- SÛR : DDL strictement ADDITIVE (ADD COLUMN IF NOT EXISTS). Aucun DROP, aucun UPDATE, aucune contrainte resserrée, aucune colonne
-- existante touchée, NI les CHECK antérieurs. Idempotente. Un seul BEGIN/COMMIT. Requiert 107. Application MANUELLE (Arno) :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/108_permis_caract_sommet.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS.

BEGIN;

ALTER TABLE permis_caracteristique
  ADD COLUMN IF NOT EXISTS altitude_sommet_ngf         numeric CONSTRAINT permis_caract_sommet_chk         CHECK (altitude_sommet_ngf >= -50 AND altitude_sommet_ngf <= 500),
  ADD COLUMN IF NOT EXISTS altitude_sommet_ngf_origine text    CONSTRAINT permis_caract_sommet_origine_chk CHECK (altitude_sommet_ngf_origine IN ('saisie','extraite'));

COMMENT ON COLUMN permis_caracteristique.altitude_sommet_ngf IS
  'N8-B — point le plus haut relevé sur les planches du permis (acrotère max, NGF). NON rattaché à un corps de bâtiment : l''attribution par lot n''est pas établie (P4/P5). Distinct de permis_corps_batiment.altitude_sommet_ngf (valeur PAR corps). Portée par altitude_sommet_ngf_origine.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (S'EXÉCUTE quand tu lances le fichier — AFFICHE le résultat) :
\echo '>>> Colonne + CHECK altitude_sommet_ngf sur permis_caracteristique :'
SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name='permis_caracteristique' AND column_name IN ('altitude_sommet_ngf','altitude_sommet_ngf_origine') ORDER BY column_name;
SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint
  WHERE conrelid='permis_caracteristique'::regclass AND conname IN ('permis_caract_sommet_chk','permis_caract_sommet_origine_chk') ORDER BY conname;
