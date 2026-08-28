-- 162_releve_hors_perimetre_decompose.sql — Module VEILLE PERMIS (chantier J1) : DÉCOMPTE du hors-périmètre au journal de relève.
-- ⚠️ POURQUOI : le journal ne comptait le hors-périmètre qu'en UN seul nombre (releve_run.hors_perimetre). Face à « 0 rattaché »,
-- le porteur ne pouvait pas distinguer un message TÉLÉCHARGÉ mais SANS ancre de rétention (le vrai « pourquoi rien n'a été
-- retenu ») d'un simple BRUIT de sonde rebond (un message d'une sonde mailer-daemon/postmaster qui n'était pas un DSN). Une
-- soirée a déjà été perdue là-dessus. Le code distingue DÉJÀ ces deux branches au moment où il écarte (releveReponses.ts) ; il
-- suffit de les COMPTER séparément et de les rendre VISIBLES (RapportReleve, CLI demandes:relever, journal à l'écran).
--
-- Cette migration ne fait QUE le schéma. Les compteurs sont calculés au runtime (releveReponses → releve_run via releveAuto).
-- Le TOTAL reste porté par la colonne existante hors_perimetre (= sonde + sans_ancre) : aucune colonne n'est retirée ni
-- réinterprétée. Les deux nouvelles colonnes sont NULL pour les runs ANTÉRIEURS (jamais recalculés) — l'affichage le gère
-- (pas de décompte affiché quand il est absent). Le code LIT et ÉCRIT ces colonnes de façon DÉFENSIVE (erreur 42703 « colonne
-- absente » tolérée), donc l'application FONCTIONNE aussi AVANT cette migration (le décompte n'apparaît simplement pas).
--
-- SÛR : DDL ADDITIVE uniquement (ADD COLUMN IF NOT EXISTS). Aucun DROP, aucun UPDATE, aucun trigger. N'écrit JAMAIS
-- demande.statut, ne touche NI demande_reponse NI la cascade NI la classification. GOLDEN-SAFE (aucun contact
-- moteur/config_scoring/batiment → golden 29.107259068449615 intact). Idempotente. Un seul BEGIN/COMMIT. Requiert 074 (releve_run).
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/162_releve_hors_perimetre_decompose.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer. TU NE L'APPLIQUES PAS.
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

-- releve_run.hors_perimetre_sonde — nombre de messages écartés parce que venus d'une SONDE rebond (mailer-daemon/postmaster)
--   SANS être un rapport de non-remise (DSN) : du bruit, jamais un message de mairie. Sous-décompte de hors_perimetre.
ALTER TABLE releve_run ADD COLUMN IF NOT EXISTS hors_perimetre_sonde integer;

-- releve_run.hors_perimetre_sans_ancre — nombre de messages TÉLÉCHARGÉS (sélectionnés par domaine/référence) mais qu'AUCUNE
--   ancre de rétention (fil, référence, n° de dossier, référence mairie, signal de domaine dérivé) ne rattachait : c'est le vrai
--   « pourquoi rien n'a été retenu ». Sous-décompte de hors_perimetre. hors_perimetre = hors_perimetre_sonde + hors_perimetre_sans_ancre.
ALTER TABLE releve_run ADD COLUMN IF NOT EXISTS hors_perimetre_sans_ancre integer;

COMMENT ON COLUMN releve_run.hors_perimetre_sonde IS
  'J1 — messages écartés car venus d''une sonde rebond (mailer-daemon/postmaster) sans être un DSN : bruit, jamais un message de mairie. Sous-décompte de hors_perimetre (NULL pour les runs antérieurs à la migration 162).';
COMMENT ON COLUMN releve_run.hors_perimetre_sans_ancre IS
  'J1 — messages téléchargés (domaine/référence) mais qu''aucune ancre de rétention ne rattachait : le « pourquoi rien n''a été retenu ». Sous-décompte de hors_perimetre (NULL pour les runs antérieurs à la migration 162).';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--
--   \d releve_run
--
--   -- les deux colonnes présentes (integer) :
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'releve_run' AND column_name IN ('hors_perimetre_sonde','hors_perimetre_sans_ancre')
--    ORDER BY column_name;   -- attendu : hors_perimetre_sans_ancre | integer  ET  hors_perimetre_sonde | integer
