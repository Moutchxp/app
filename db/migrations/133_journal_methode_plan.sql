-- 133_journal_methode_plan.sql — N10-I : élargir la méthode du journal d'extraction à 'plan'.
--
-- POURQUOI : la hauteur maximale PLU est lue sur une PLANCHE par GÉOMÉTRIE (position des items pdfjs : le libellé « hauteur
-- maximale PLU » rattaché à la cote NGF la plus proche, échelle affine des coupes). Ce n'est ni 'motifs' (extraction par motifs
-- de texte), ni 'cerfa' (champ AcroForm), ni 'enonce' (fait énoncé en toutes lettres), ni 'ia'. Un journal qui mentirait sur sa
-- méthode serait pire que pas de journal → on ajoute la valeur 'plan' à la liste fermée.
--
-- SÛR : DDL minimale, idempotente (DROP CONSTRAINT IF EXISTS + ADD). CHECK ÉLARGI (surensemble) : aucune ligne existante ne peut
-- le violer. Ne touche aucune donnée. Requiert 109. Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/133_journal_methode_plan.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

ALTER TABLE permis_extraction_journal DROP CONSTRAINT IF EXISTS permis_journal_methode_chk;
ALTER TABLE permis_extraction_journal ADD  CONSTRAINT permis_journal_methode_chk CHECK (methode IN ('motifs','cerfa','ia','enonce','plan'));

COMMENT ON COLUMN permis_extraction_journal.methode IS
  'motifs = extraction par motifs (N5) | cerfa = champ AcroForm (N7-D) | enonce = fait ÉNONCÉ dans une pièce (N8-B) | plan = cote LUE sur une planche par géométrie/position (N10-I, ex. hauteur max PLU) | ia = repli IA prévu. Liste fermée.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (S'EXÉCUTE — AFFICHE la contrainte résultante) :
\echo '>>> Contrainte methode après 133 (attendu : IN (''motifs'', ''cerfa'', ''ia'', ''enonce'', ''plan'')) :'
SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint
  WHERE conrelid='permis_extraction_journal'::regclass AND conname='permis_journal_methode_chk';
