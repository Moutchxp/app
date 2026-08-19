-- 128_relance_reglages_et_variante.sql — LOT B : réglages de RELANCE (config_veille) + marqueur de VARIANTE (demande_relance).
--
-- CONTEXTE (feature « relance à J-10 + envoi manuel/auto », canal e-mail SEUL) : ce lot POSE le socle de configuration et le
-- marqueur de variante, SANS changer aucun comportement visible. Il n'introduit AUCUN envoi et NE CÂBLE RIEN sur le booléen
-- d'automatisation (l'envoi auto est un lot ultérieur, décidé séparément).
--
-- ① config_veille.relance_auto_active — booléen d'automatisation des relances. STOCKÉ et AFFICHÉ dès ce lot, mais LU PAR
--    AUCUN CODE D'ENVOI ici : aucune décision d'envoi n'en dépend tant que le lot d'envoi automatique n'est pas livré.
-- ② config_veille.relance_jours_avant_echeance — à partir de combien de jours AVANT l'échéance d'un mois un rappel est
--    PRÉPARÉ (la préparation a toujours lieu ; elle n'envoie rien). Borné 1..30, défaut 10.
-- ③ demande_relance.variante — 'rappel' | 'formelle' : registre de langage du brouillon (genererRelance, lot A). N'a de sens
--    que pour type='relance' ; sur une ligne type='saisine_cada' la valeur est le DÉFAUT, sans signification (voir COMMENT).
--
-- PILOTAGE SANS CODE : les deux réglages vivent EN TABLE (éditables dans Réglages), bornes dans le CHECK (lues au runtime par
-- parserBornesCheck), aucune plage recopiée dans le code. Repli applicatif : chargerConfigVeille lit les défauts (false / 10)
-- si les colonnes n'existent pas encore — le reste de la config n'est pas dégradé (lecture isolée, motif des migrations 069+).
--
-- ADDITIVE PURE : trois ADD COLUMN IF NOT EXISTS (deux booléen/entier bornés + un texte à liste fermée), CHECK EN LIGNE (donc
-- idempotents, rejouables). Aucun UPDATE/DELETE/DROP, aucun trigger. NE TOUCHE NI le CHECK de demande_relance.type NI l'index
-- unique « une relance vivante par (demande_id, type) ». Ne touche ni le moteur de score ni demande.statut. Une transaction.
--
-- APPLICATION MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/128_relance_reglages_et_variante.sql
-- DRY-RUN : remplacer « COMMIT; » par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

-- ① + ② config_veille : deux réglages de relance, pilotables SANS CODE (lus au runtime, éditables dans Réglages).
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS relance_auto_active boolean NOT NULL DEFAULT false;
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS relance_jours_avant_echeance integer NOT NULL DEFAULT 10
  CHECK (relance_jours_avant_echeance BETWEEN 1 AND 30);

COMMENT ON COLUMN config_veille.relance_auto_active IS
  'LOT B — envoyer les relances automatiquement (sans relecture) ? Stocké et affiché, mais LU PAR AUCUN CODE D''ENVOI dans ce lot : aucune décision d''envoi n''en dépend tant que le lot d''envoi automatique n''est pas livré. Défaut false (rien ne part sans un clic).';
COMMENT ON COLUMN config_veille.relance_jours_avant_echeance IS
  'LOT B — nombre de jours AVANT l''échéance d''un mois à partir duquel un rappel est PRÉPARÉ pour une demande restée sans réponse. La préparation a toujours lieu ; elle n''envoie rien. Borné 1..30, défaut 10.';

-- ③ demande_relance : marqueur de VARIANTE du brouillon (registre de langage, lot A). Liste fermée, défaut 'formelle'.
ALTER TABLE demande_relance ADD COLUMN IF NOT EXISTS variante text NOT NULL DEFAULT 'formelle'
  CHECK (variante IN ('rappel', 'formelle'));

COMMENT ON COLUMN demande_relance.variante IS
  'LOT A/B — registre de langage du brouillon : ''rappel'' (mairie encore dans son délai : courtois, ni refus tacite ni CADA) ou ''formelle'' (hors délai : constat du refus tacite + CADA). N''a de sens QUE pour type=''relance''. Sur une ligne type=''saisine_cada'', la valeur est le DÉFAUT ''formelle'' et NE SIGNIFIE RIEN (ne pas l''interpréter).';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (s'exécute au lancement) :
\echo '>>> ① colonnes config_veille présentes + défauts :'
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'config_veille' AND column_name IN ('relance_auto_active', 'relance_jours_avant_echeance')
ORDER BY column_name;
\echo '>>> ② valeurs du singleton (défauts false / 10) :'
SELECT relance_auto_active, relance_jours_avant_echeance FROM config_veille WHERE id = 1;
\echo '>>> ③ borne de relance_jours_avant_echeance (lisible par parserBornesCheck) :'
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'config_veille'::regclass AND conname LIKE '%relance_jours_avant_echeance%';
\echo '>>> ④ colonne demande_relance.variante + liste fermée :'
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'demande_relance' AND column_name = 'variante';
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'demande_relance'::regclass AND conname LIKE '%variante%';
\echo '>>> ⑤ l''index unique « une relance vivante par (demande_id, type) » est INCHANGÉ (ne cite pas variante) :'
SELECT indexdef FROM pg_indexes WHERE tablename = 'demande_relance' AND indexname = 'demande_relance_vivante_uniq';
