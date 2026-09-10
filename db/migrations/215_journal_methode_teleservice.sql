-- 215_journal_methode_teleservice.sql — CR-3 : élargir la méthode du journal d'extraction à 'teleservice'.
--
-- POURQUOI : le téléservice de la mairie pré-remplit le champ libre du Cerfa par une PHRASE GÉNÉRÉE
-- (« Construction d'un bâtiment à R+N sur M niveau(x) de sous-sol à destination … Surface créée: S m² »),
-- distincte de la déclaration de l'architecte (CR-1b). Ses valeurs (niveaux hors sol, sous-sols, destination…)
-- sont un DÉRIVÉ produit par la mairie, ni 'cerfa' (champ AcroForm), ni 'enonce'/'plan' (planches), ni 'ia',
-- ni 'motifs' : c'est une méthode à part, déjà posée dans precedenceMethodes.ts (rang SOUS plan, AU-DESSUS de
-- ia). Pour instruire un champ VIDE avec cette valeur (CR-3), le journal doit pouvoir porter la méthode
-- 'teleservice' — sinon l'INSERT viole le CHECK et la journalisation échoue.
--
-- SÛR : DDL minimale, IDEMPOTENTE (DROP CONSTRAINT IF EXISTS + ADD). CHECK ÉLARGI (surensemble strict de 193) :
-- aucune ligne existante ne peut le violer. Ne touche AUCUNE donnée (aucun DELETE/UPDATE/TRUNCATE/DROP de table).
-- Requiert 193. Le code est RÉSILIENT si cette migration MANQUE : l'INSERT methode='teleservice' viole le CHECK →
-- capturé (teleserviceRepo) → no-op, aucun champ instruit (comportement d'avant). Application MANUELLE (Arno),
-- arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/215_journal_methode_teleservice.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

ALTER TABLE permis_extraction_journal DROP CONSTRAINT IF EXISTS permis_journal_methode_chk;
ALTER TABLE permis_extraction_journal ADD  CONSTRAINT permis_journal_methode_chk CHECK (methode IN ('motifs','cerfa','ia','enonce','plan','recap','teleservice'));

COMMENT ON COLUMN permis_extraction_journal.methode IS
  'motifs = extraction par motifs (N5) | cerfa = champ AcroForm (N7-D) | enonce = fait ÉNONCÉ dans une pièce (N8-B) | plan = cote LUE sur une planche par géométrie (N10-I) | ia = repli IA | recap = valeur DÉCLARÉE dans le champ libre du récapitulatif, corroborée par une somme (LOT 69) | teleservice = valeur DÉRIVÉE de la phrase générée par le téléservice de la mairie (CR-1b/CR-3), rang SOUS plan et AU-DESSUS de ia. Liste fermée.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (S'EXÉCUTE — AFFICHE la contrainte résultante) :
\echo '>>> Contrainte methode après 215 (attendu : IN (''motifs'', ''cerfa'', ''ia'', ''enonce'', ''plan'', ''recap'', ''teleservice'')) :'
SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint
  WHERE conrelid='permis_extraction_journal'::regclass AND conname='permis_journal_methode_chk';
