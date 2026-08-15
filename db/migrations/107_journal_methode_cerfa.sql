-- 107_journal_methode_cerfa.sql — Module VEILLE PERMIS (chantier N7-D) : élargir la méthode d'extraction du journal à 'cerfa'.
-- ⚠️ POURQUOI : une valeur lue dans un CHAMP AcroForm d'un Cerfa (N7-B/N7-D) n'est NI un motif textuel ('motifs', N5) NI une IA
-- ('ia', réservé) : la ranger sous 'motifs' mentirait sur sa provenance. On ajoute 'cerfa' à la liste fermée `methode`.
--
-- SÛR : DDL minimale, idempotente (DROP CONSTRAINT IF EXISTS puis ADD CONSTRAINT). Ne touche aucune donnée, aucune autre colonne,
-- aucun CHECK de 103/106. Le CHECK n'est qu'ÉLARGI (surensemble) : aucune ligne existante ne peut le violer. Requiert 106.
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/107_journal_methode_cerfa.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer. TU NE L'APPLIQUES PAS.

BEGIN;

ALTER TABLE permis_extraction_journal DROP CONSTRAINT IF EXISTS permis_journal_methode_chk;
ALTER TABLE permis_extraction_journal ADD  CONSTRAINT permis_journal_methode_chk CHECK (methode IN ('motifs','cerfa','ia'));

COMMENT ON COLUMN permis_extraction_journal.methode IS
  'motifs = extraction par motifs (N5) | cerfa = valeur lue dans un champ de formulaire AcroForm (N7-D) | ia = couture prévue pour le repli IA. Liste fermée.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (S'EXÉCUTE quand tu lances le fichier — AFFICHE la contrainte résultante) :
\echo '>>> Contrainte methode après 107 (attendu : CHECK ... IN (''motifs'', ''cerfa'', ''ia'')) :'
SELECT conname, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
 WHERE conrelid = 'permis_extraction_journal'::regclass AND conname = 'permis_journal_methode_chk';
