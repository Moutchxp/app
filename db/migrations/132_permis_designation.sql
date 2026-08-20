-- 132_permis_designation.sql — N10-H : DÉSIGNATION de l'opération (nom du projet en TEXTE LIBRE, niveau PERMIS).
--
-- CONTEXTE : la mesure N10-F a établi que le corpus NOMME le projet, verbatim et de façon stable (« Équipement Multisports –
-- Lot 12 – ZAC PYTHON DUVERNOIS »), mais qu'AUCUN champ de l'écran ne le portait : les destinations Cerfa restent vides (à raison,
-- aucun terme de la liste fermée n'est attribuable) et « Construction neuve » décrit les TRAVAUX, pas ce que le bâtiment EST. Ce
-- champ range enfin cette information vue et jamais rangée, pour que la case-destination vide cesse de ressembler à un échec.
--
-- SCHÉMA (décision Arno) : NIVEAU PERMIS (une désignation nomme l'opération entière, jamais un corps — cf. N10-F). Deux colonnes,
-- pattern valeur + origine comme les autres champs déclarés. TEXTE LIBRE, VERBATIM : aucune normalisation, aucune liste fermée,
-- aucune troncature — ce que le document écrit, tel qu'il l'écrit. Éditable à la main (origine 'saisie', jamais réécrasée par une
-- extraction) ; extraction 'extraite' possible (règle N10-H : ligne libellée « Nom de l'opération : … », abstention sinon).
-- ⚠️ AUCUN mapping vers la liste fermée des destinations : traduire un titre en case cochée serait une inférence invisible.
--
-- ADDITIVE PURE : deux ADD COLUMN IF NOT EXISTS (nullable, sans défaut), CHECK EN LIGNE sur l'origine (idempotent ; passe sur NULL).
-- Aucun UPDATE/DROP/trigger, aucune valeur modifiée.
--
-- APPLICATION MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/132_permis_designation.sql
-- DRY-RUN : remplacer « COMMIT; » par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

ALTER TABLE permis_caracteristique ADD COLUMN IF NOT EXISTS designation text;
ALTER TABLE permis_caracteristique ADD COLUMN IF NOT EXISTS designation_origine text
  CHECK (designation_origine IN ('saisie', 'extraite'));

COMMENT ON COLUMN permis_caracteristique.designation IS
  'N10-H — désignation de l''opération, texte libre VERBATIM (nom du projet tel qu''écrit dans le dossier). Aucune normalisation, aucune liste fermée. Niveau permis. Peut porter un résidu de mise en page si extraite (pdfjs sur typographie espacée) — corrigeable à la main.';
COMMENT ON COLUMN permis_caracteristique.designation_origine IS
  'N10-H — origine de la désignation (''saisie'' | ''extraite''), posée AVEC la valeur (null ⇒ origine null). Une saisie n''est jamais réécrasée par une extraction.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (s'exécute au lancement) :
\echo '>>> colonnes présentes (nullable, sans défaut) :'
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'permis_caracteristique' AND column_name LIKE 'designation%'
ORDER BY column_name;
\echo '>>> liste fermée de l''origine :'
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'permis_caracteristique'::regclass AND contype = 'c'
  AND pg_get_constraintdef(oid) ILIKE '%designation_origine%';
