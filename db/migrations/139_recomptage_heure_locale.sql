-- 139_recomptage_heure_locale.sql — PASTILLES D'ACTIONS : heure du recomptage QUOTIDIEN des compteurs affichés.
--
-- CONTEXTE : les pastilles « actions en attente » (onglets Réponses / Saisines CADA / Rattachement + tuile home) se recomptent
-- à l'ouverture d'un onglet et après chaque action réussie. Pour le cas où l'admin reste ouverte longtemps SANS interaction, un
-- recomptage quotidien à heure réglable rafraîchit les compteurs. ⚠️ Ce réglage NE LIT PAS la boîte mail : il ne fait que
-- rafraîchir les compteurs déjà affichés (aucune relève de messages). Il ne sert que si l'admin est restée ouverte ; sinon
-- l'ouverture de page joue déjà ce rôle.
--
-- ① config_veille.recomptage_heure_locale (int 0..23, DEFAULT 8 = 08:00). MÊME type que alerte_heure_locale (078). Thème
--    d'affichage : « Automatisation » (onglet du module Permis). Borne LUE AU RUNTIME (parserBornesCheck).
--
-- ADDITIVE / SÛRE : un seul ADD COLUMN IF NOT EXISTS sur le singleton, aucune donnée touchée, aucun DROP/DELETE/TRUNCATE, aucun
-- trigger. N'affecte NI le moteur de score, NI config_scoring, NI le golden. Une seule transaction. Rejouable (IF NOT EXISTS).
--
-- APPLICATION MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/139_recomptage_heure_locale.sql
-- DRY-RUN : remplacer « COMMIT; » par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS recomptage_heure_locale integer NOT NULL DEFAULT 8
  CHECK (recomptage_heure_locale BETWEEN 0 AND 23);

COMMENT ON COLUMN config_veille.recomptage_heure_locale IS
  'PASTILLES — heure locale (0..23) du recomptage QUOTIDIEN des compteurs « actions en attente ». NE lit PAS la boîte mail : rafraîchit seulement les compteurs affichés, et seulement si l''admin est restée ouverte (sinon l''ouverture de page joue ce rôle). Défaut 8. Thème « Automatisation ».';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (s'exécute au lancement) :
\echo '>>> ① colonne recomptage_heure_locale + défaut (8) :'
SELECT column_name, data_type, column_default FROM information_schema.columns
WHERE table_name = 'config_veille' AND column_name = 'recomptage_heure_locale';
\echo '>>> ② borne CHECK (0..23, lisible par parserBornesCheck) :'
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'config_veille'::regclass AND conname LIKE '%recomptage_heure_locale%';
