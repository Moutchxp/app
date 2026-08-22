-- 140_envoi_fenetre_horaire.sql — RELANCE : fenêtre HORAIRE d'envoi automatique (matin, jours ouvrés).
--
-- CONTEXTE : la cascade envoie aujourd'hui dès que la fenêtre d'étape s'ouvre, quelle que soit l'heure et le jour — un rappel
-- pourrait partir un dimanche soir à 21 h, ce qui « fait robot ». On borne l'envoi AUTOMATIQUE à une FENÊTRE horaire, du lundi au
-- vendredi. Une fenêtre (et non une heure fixe) car la veille tourne toutes les 15 min : un tic tombe forcément dedans même si
-- un autre est manqué.
--
-- ① config_veille.envoi_heure_debut (int 0..23, DEFAULT 9) et envoi_heure_fin (int 0..23, DEFAULT 11). MÊME type que
--    alerte_heure_locale (078). Thème d'affichage : « Envoi aux mairies ». Bornes LUES AU RUNTIME (parserBornesCheck).
--    ⚠️ La cohérence « début < fin » N'EST PAS un CHECK en base (VOLONTAIREMENT) : le moteur d'envoi doit TOLÉRER une config
--    incohérente sans planter — il n'envoie alors rien et le signale au compte rendu. Un CHECK inter-colonnes rendrait ce
--    chemin de repli inatteignable.
--
-- ADDITIVE / SÛRE : deux ADD COLUMN IF NOT EXISTS sur le singleton, aucune donnée touchée, aucun DROP/DELETE/TRUNCATE, aucun
-- trigger. N'affecte NI le moteur de score, NI config_scoring, NI le golden. Une seule transaction. Rejouable.
--
-- APPLICATION MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/140_envoi_fenetre_horaire.sql
-- DRY-RUN : remplacer « COMMIT; » par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS envoi_heure_debut integer NOT NULL DEFAULT 9
  CHECK (envoi_heure_debut BETWEEN 0 AND 23);
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS envoi_heure_fin integer NOT NULL DEFAULT 11
  CHECK (envoi_heure_fin BETWEEN 0 AND 23);

COMMENT ON COLUMN config_veille.envoi_heure_debut IS
  'RELANCE — début (heure locale 0..23) de la fenêtre d''envoi AUTOMATIQUE des relances (du lundi au vendredi). Défaut 9. Jours fériés non pris en compte (choix assumé). Thème « Envoi aux mairies ».';
COMMENT ON COLUMN config_veille.envoi_heure_fin IS
  'RELANCE — fin (heure locale 0..23, exclue) de la fenêtre d''envoi AUTOMATIQUE des relances. Défaut 11. Doit être > début, sinon le moteur n''envoie rien et le signale (pas de CHECK inter-colonnes : le repli doit rester atteignable).';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (s'exécute au lancement) :
\echo '>>> ① colonnes + défauts (9 / 11) :'
SELECT column_name, data_type, column_default FROM information_schema.columns
WHERE table_name = 'config_veille' AND column_name IN ('envoi_heure_debut', 'envoi_heure_fin') ORDER BY column_name;
\echo '>>> ② bornes CHECK (0..23, lisibles par parserBornesCheck) :'
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'config_veille'::regclass AND conname LIKE '%envoi_heure%' ORDER BY conname;
