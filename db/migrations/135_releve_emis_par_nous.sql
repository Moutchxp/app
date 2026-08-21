-- 135_releve_emis_par_nous.sql — Module VEILLE PERMIS (correctif « boucle d'auto-alerte ») : compteur au journal de relève.
-- ⚠️ POURQUOI : nos e-mails automatiques (alertes T7-B, alerte GED G1, récapitulatif, relances) partent de noreply@ vers la
-- boîte que la relève LIT. Ils forwardent le message d'origine de la mairie → CITENT sa référence → l'ancien prédicat de
-- rétention (contientReferenceMairie) les retenait, la cascade les rattachait, T7-A les classait « autre » → nouvelle alerte
-- → relevée au tour suivant → BOUCLE (corps grossissant à chaque tour). Le code les IGNORE désormais EN AMONT de toute
-- rétention (deux signaux : en-tête d'auto-émission X-SVAV-Auto posé à l'envoi + expéditeur = MAIL_FROM). Ce rejet doit être
-- COMPTÉ et VISIBLE au journal, comme hors_perimetre — « plus aucun rejet muet ».
--
-- Cette migration ne fait QUE le schéma : le compteur est calculé au runtime (releveReponses → releve_run.emis_par_nous).
--
-- SÛR : DDL ADDITIVE uniquement (ADD COLUMN IF NOT EXISTS). Aucun DROP, aucun UPDATE, aucun trigger. N'écrit JAMAIS
-- demande.statut, ne touche NI demande_reponse NI la cascade NI la classification. GOLDEN-SAFE (aucun contact
-- moteur/config_scoring/batiment → golden 29.107259068449615 intact). Idempotente. Un seul BEGIN/COMMIT. Requiert 074 (releve_run).
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/135_releve_emis_par_nous.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer. TU NE L'APPLIQUES PAS.
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

-- releve_run.emis_par_nous — nombre de messages ÉMIS PAR NOUS ignorés pendant ce run (avant toute rétention). Compteur d'écart
--   (cumulable), à côté des motifs d'écartement déjà tracés (deja_connus, hors_perimetre, rebonds_etrangers…).
ALTER TABLE releve_run ADD COLUMN IF NOT EXISTS emis_par_nous integer;

COMMENT ON COLUMN releve_run.emis_par_nous IS
  'Nombre de messages ÉMIS PAR NOUS (en-tête d''auto-émission X-SVAV-Auto OU expéditeur = MAIL_FROM) ignorés pendant ce run, en amont de toute rétention : jamais retenus, rattachés, classés ni enregistrés. Correctif de la boucle d''auto-alerte (une alerte qui forwarde le message mairie cite sa référence et se faisait re-capter).';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--
--   \d releve_run
--
--   -- colonne emis_par_nous présente (integer) :
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'releve_run' AND column_name = 'emis_par_nous';   -- attendu : emis_par_nous | integer
