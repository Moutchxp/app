-- 224_config_veille_email_envoi_initial_auto.sql — Rail E-MAIL : interrupteur d'ENVOI AUTOMATIQUE de la 1re DEMANDE d'information.
--
-- ⚠️ POURQUOI : le bloc « auto / manuel » de l'onglet « À demander » (rail e-mail) doit OFFICIALISER l'envoi automatique de la
-- première demande, et être SYNCHRONISÉ avec l'onglet Réglages (« Envoi & relances ») — une SEULE vérité, éditable des deux côtés.
-- Aujourd'hui la 1re demande ne part QUE par le CLI manuel `demandes:envoyer --appliquer` ; ce drapeau permet, une fois ARMÉ, que la
-- veille l'envoie automatiquement (chemin `envoyerDemandes`, statut 'prete' + canal e-mail), en respectant TOUS les caps/plafonds/fenêtre.
--
-- 🔴 SÉPARATION IMPÉRATIVE : ce drapeau ne concerne QUE la 1re demande. Il est DISTINCT de `relance_auto_active` (relances),
--    `saisine_cada_auto_active` (CADA) et `cascade_partiel_auto_active` (cascade partielle) — aucun de ces automatismes n'est touché,
--    ni lu, ni écrit par ce lot. Ces réglages restent pilotés là où ils le sont.
--
-- 🔴 GARDE : ce lot ne touche NI le moteur SVAV, NI le golden Asnières, NI une altitude, NI config_scoring, NI aucune donnée existante.
--    Défaut OFF (opt-in EXPLICITE, avec confirmation à l'écran) : aucune bascule silencieuse, aucun envoi déclenché par la migration.
--
-- SÛR : ADD COLUMN « IF NOT EXISTS », booléen NOT NULL DEFAULT false. Aucun DROP, aucune écriture de donnée. GOLDEN-SAFE. Idempotente.
-- Une seule transaction. Requiert config_veille (048). Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/224_config_veille_email_envoi_initial_auto.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

ALTER TABLE config_veille
  ADD COLUMN IF NOT EXISTS email_envoi_initial_auto_active boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN config_veille.email_envoi_initial_auto_active IS
  'Rail E-mail : la 1re DEMANDE d''information part-elle AUTOMATIQUEMENT (true) ou reste-t-elle à envoyer à la main (false, défaut) ? Édité indifféremment depuis le bloc « À demander » et l''onglet Réglages (même vérité). DISTINCT de relance_auto_active / saisine_cada_auto_active / cascade_partiel_auto_active (relances/saisines) — aucun lien. Une fois true, la veille envoie via envoyerDemandes en respectant tous les caps/plafonds/fenêtre. Défaut OFF (opt-in explicite, confirmation à l''écran).';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (LECTURE SEULE) :
\echo '>>> colonne (type + défaut) :'
SELECT column_name, data_type, column_default FROM information_schema.columns
 WHERE table_name = 'config_veille' AND column_name = 'email_envoi_initial_auto_active';

-- ═════════════════════════════════════════════════════════════════════════════
-- 🔙 ROLLBACK (additive → réversible) :
--   psql "$DATABASE_URL" -c "ALTER TABLE config_veille DROP COLUMN IF EXISTS email_envoi_initial_auto_active;"
