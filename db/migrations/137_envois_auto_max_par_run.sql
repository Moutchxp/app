-- 137_envois_auto_max_par_run.sql — RELANCE LOT 6/6 (envoi automatique) : plafond SPÉCIFIQUE à l'envoi AUTOMATIQUE.
--
-- CONTEXTE / GRAVITÉ : le lot 6 lève l'invariant « executerVeille n'écrit jamais à un tiers » — sous deux interrupteurs opt-in
-- (relance_auto_active, saisine_cada_auto_active, déjà en base, défaut false). En AUTOMATIQUE, personne ne regarde au moment de
-- l'envoi : un réglage mal saisi ou une date mal calculée pourrait viser des dizaines de demandes. Ce plafond BORNE L'ACCIDENT.
--
-- ① config_veille.envois_auto_max_par_run (int, DEFAULT 5, CHECK 1..50, borne LUE AU RUNTIME → parserBornesCheck). Il s'applique
--    EN PLUS des caps existants (envois_max_par_run / envois_max_par_jour), JAMAIS à leur place : la salve réelle est le MINIMUM
--    des trois. Les caps existants bornent l'envoi MANUEL (un humain déclenche et voit le résultat) ; celui-ci borne l'envoi
--    AUTOMATIQUE (aucune relecture). Thème d'affichage (interface d'admin) : « Envoi aux mairies ».
--
-- ADDITIVE / SÛRE : un seul ADD COLUMN IF NOT EXISTS sur le singleton, aucune donnée touchée, aucun DROP/DELETE/TRUNCATE, aucun
-- trigger. N'affecte NI le moteur de score, NI config_scoring, NI le golden. Une seule transaction. Rejouable (IF NOT EXISTS).
--
-- APPLICATION MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/137_envois_auto_max_par_run.sql
-- DRY-RUN : remplacer « COMMIT; » par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS envois_auto_max_par_run integer NOT NULL DEFAULT 5
  CHECK (envois_auto_max_par_run BETWEEN 1 AND 50);

COMMENT ON COLUMN config_veille.envois_auto_max_par_run IS
  'RELANCE lot 6 — plafond du nombre de courriers envoyés par UN run AUTOMATIQUE (relances + saisines cumulées), tous interrupteurs auto confondus. S''applique EN PLUS des caps manuels (envois_max_par_run, envois_max_par_jour) : la salve réelle = MINIMUM des trois. Motif : en automatique personne ne relit — ce plafond borne l''accident (réglage/date erronés). Borné 1..50, défaut 5. Thème « Envoi aux mairies ».';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (s'exécute au lancement) :
\echo '>>> ① colonne envois_auto_max_par_run + défaut (5) :'
SELECT column_name, data_type, column_default, is_nullable FROM information_schema.columns
WHERE table_name = 'config_veille' AND column_name = 'envois_auto_max_par_run';
\echo '>>> ② borne CHECK (lisible par parserBornesCheck : >= 1 et <= 50) :'
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'config_veille'::regclass AND conname LIKE '%envois_auto_max_par_run%';
\echo '>>> ③ valeur du singleton :'
SELECT envois_auto_max_par_run FROM config_veille WHERE id = 1;
