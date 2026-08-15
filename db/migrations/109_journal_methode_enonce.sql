-- 109_journal_methode_enonce.sql — Module VEILLE PERMIS (chantier N8-B) : élargir la méthode du journal à 'enonce'.
-- ⚠️ POURQUOI — CORRIGE UNE RÉGRESSION : dès qu'un permis a ≥2 corps, un recompute `permis:ecrire-champs` (a) PURGE tout le
-- journal methode='motifs' du dossier, (b) n'écrit rien aux corps (règle « ≥2 corps → n'attribuer à aucun »). Les FAITS ÉNONCÉS
-- écrits en N8-B (nb_etages par lot, etc.) doivent donc être journalisés sous une méthode que ce recompute NE purge PAS. On ajoute
-- 'enonce' = fait lu et ÉNONCÉ dans une pièce (ex. « Lot 2D1 en R+7 »), distinct de 'motifs' (extraction par motifs) et 'cerfa'.
-- Ainsi valeurs ET journal survivent au recompute (celui-ci ne touche que 'motifs' et 'cerfa').
--
-- SÛR : DDL minimale, idempotente (DROP CONSTRAINT IF EXISTS + ADD). CHECK ÉLARGI (surensemble) : aucune ligne existante ne peut
-- le violer. Ne touche aucune donnée. Requiert 107. Application MANUELLE (Arno) :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/109_journal_methode_enonce.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS.

BEGIN;

ALTER TABLE permis_extraction_journal DROP CONSTRAINT IF EXISTS permis_journal_methode_chk;
ALTER TABLE permis_extraction_journal ADD  CONSTRAINT permis_journal_methode_chk CHECK (methode IN ('motifs','cerfa','ia','enonce'));

COMMENT ON COLUMN permis_extraction_journal.methode IS
  'motifs = extraction par motifs (N5) | cerfa = champ de formulaire AcroForm (N7-D) | enonce = fait ÉNONCÉ dans une pièce, ex. « Lot 2D1 en R+7 » (N8-B) — non purgé par le recompute des motifs | ia = repli IA prévu. Liste fermée.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (S'EXÉCUTE — AFFICHE la contrainte résultante) :
\echo '>>> Contrainte methode après 109 (attendu : IN (''motifs'', ''cerfa'', ''ia'', ''enonce'')) :'
SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint
  WHERE conrelid='permis_extraction_journal'::regclass AND conname='permis_journal_methode_chk';
