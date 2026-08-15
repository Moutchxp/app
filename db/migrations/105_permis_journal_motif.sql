-- 105_permis_journal_motif.sql — Module VEILLE PERMIS (chantier N5-E) : ajoute la colonne `motif` au journal d'extraction.
-- ⚠️ POURQUOI : N5-E généralise la décision à TOUS les champs. Chaque champ NON écrit produit désormais une ligne role='ecartee'
-- portant un MOTIF explicite (« aucun candidat trouvé dans le corpus », « gabarit à plage… valeur non attribuable », etc.). Le
-- but : répondre, pour n'importe quel permis et n'importe quel champ, à « pourquoi est-ce vide ? » sans rouvrir les PDF. La 104
-- n'avait pas de logement pour cette phrase (`reserve` sert la valeur RETENUE, pas l'absence) → une colonne dédiée.
--
-- SÛR : DDL strictement ADDITIVE (ADD COLUMN IF NOT EXISTS). Aucun DROP, aucun UPDATE, aucun backfill, aucune contrainte
-- resserrée. Ne touche NI le moteur de score (golden intact), NI la 104, NI aucune donnée. Idempotente. Un seul BEGIN/COMMIT.
-- Requiert 104 (permis_extraction_journal). Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/105_permis_journal_motif.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer. TU NE L'APPLIQUES PAS.

BEGIN;

ALTER TABLE permis_extraction_journal ADD COLUMN IF NOT EXISTS motif text;

COMMENT ON COLUMN permis_extraction_journal.motif IS
  'N5-E — motif de NON-ÉCRITURE, porté par une ligne role=''ecartee'' (« aucun candidat trouvé dans le corpus », « gabarit à plage annoncé pour plusieurs corps, valeur non attribuable », « plusieurs cotes distinctes sur le niveau le plus haut, association ambiguë », « une valeur saisie à la main occupe déjà le champ »…). NULL sur retenue/candidat. Répond à « pourquoi ce champ est-il vide ? » sans rouvrir les PDF.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--   \d permis_extraction_journal   -- la colonne `motif text` apparaît
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='permis_extraction_journal' AND column_name='motif';  -- 1 ligne
--   -- POSITIF (une ligne 'ecartee' avec motif ; annulé) :
--   -- BEGIN;
--   --   INSERT INTO permis_extraction_journal (dossier_id, champ, role, methode, motif)
--   --     VALUES ((SELECT id FROM sitadel_dossier LIMIT 1), 'hauteur_relative_m', 'ecartee', 'motifs', 'aucun candidat trouvé dans le corpus');
--   --   SELECT champ, role, motif FROM permis_extraction_journal WHERE motif IS NOT NULL;
--   -- ROLLBACK;
