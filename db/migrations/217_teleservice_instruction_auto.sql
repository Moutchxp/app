-- 217_teleservice_instruction_auto.sql — CR-4 : interrupteur de l'INSTRUCTION AUTOMATIQUE des valeurs du téléservice.
--
-- POURQUOI : l'instruction des valeurs de la part GÉNÉRÉE par le téléservice (CR-3, decisionTeleservice) était jusqu'ici lancée À LA
-- MAIN (script permis:instruire-teleservice). CR-4 la branche sur la préparation de fond (precalculBestOfAuto), mais — règle produit —
-- toute automatisation doit être activable/désactivable depuis l'interface. On ajoute donc un drapeau *_auto_active à config_veille,
-- sur le modèle EXACT de relance_auto_active / rattachement_suivi_auto_active. DÉFAUT FALSE : l'automatisation ne démarre JAMAIS d'elle-
-- même ; Arno l'allume explicitement depuis l'écran Réglages.
--
-- SÛR : DDL additive, idempotente (ADD COLUMN IF NOT EXISTS). N'écrit AUCUNE donnée. Le code est RÉSILIENT si cette colonne MANQUE
-- (lecteur isolé try/catch → false) : le fond n'instruit pas, l'écran Réglages affiche l'interrupteur à « désactivé ». Application
-- MANUELLE (Arno), quand il veut allumer :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/217_teleservice_instruction_auto.sql
-- DRY-RUN : remplacer « COMMIT; » par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS teleservice_instruction_auto_active boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN config_veille.teleservice_instruction_auto_active IS
  'CR-4 — Interrupteur de l''instruction AUTOMATIQUE des valeurs du téléservice (part générée du Cerfa) dans les champs de caractéristiques VIDES, pendant la préparation de fond. FALSE par défaut : ne démarre jamais d''elle-même. Mêmes décisions qu''en manuel (decisionTeleservice) ; n''écrit qu''un champ vide, jamais par-dessus un rang supérieur.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
\echo '>>> Colonne teleservice_instruction_auto_active après 217 (attendu : boolean NOT NULL DEFAULT false) :'
SELECT column_name, data_type, column_default FROM information_schema.columns
  WHERE table_name = 'config_veille' AND column_name = 'teleservice_instruction_auto_active';
