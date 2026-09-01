-- 187_depot_releve_delai.sql — LOT 34 : DÉLAI (secondes) avant la relève DÉCLENCHÉE par le clic « copier » d'un dépôt téléservice.
--
-- ⚠️ RÈGLE MÉTIER (Arno, LOT 34) : quand Arno clique « copier » sur la carte de dépôt téléservice, la boîte doit être relevée
-- « peu après », sans attendre le créneau ordinaire (releve_intervalle_minutes). Ce délai laisse à l'accusé de réception de la
-- mairie le temps d'arriver. Il s'aligne sur la fenêtre de détection déjà présente (echeance_detection_le, 60 s par défaut).
--
-- 🔴 CE QUE FAIT LA MIGRATION : ajoute config_veille.depot_releve_delai_secondes (entier, DÉFAUT 60, CHECK 5..3600). Lu au runtime
--    (pilotage sans code : ParamVeille + thème « Réponses »). Repli sûr = 60 côté code si la colonne manque (187 non appliquée).
--    La relève déclenchée est en LECTURE SEULE (executerReleveManuelle) : elle ne provoque JAMAIS d'envoi sortant. N'affecte NI le
--    moteur SVAV, NI le verdict, NI le golden Asnières (29.107259068449615). AUCUN envoi ici.
--
-- ADDITIVE PURE : ADD COLUMN IF NOT EXISTS + CHECK inline (idempotent : IF NOT EXISTS saute toute la clause si la colonne existe).
-- Aucun DROP/UPDATE de données. Idempotente (relançable). GOLDEN-SAFE. Une transaction. Requiert config_veille (singleton id=1).
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/187_depot_releve_delai.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS depot_releve_delai_secondes integer NOT NULL DEFAULT 60
  CHECK (depot_releve_delai_secondes BETWEEN 5 AND 3600);

COMMENT ON COLUMN config_veille.depot_releve_delai_secondes IS
  'LOT 34 — délai (secondes) entre le clic « copier » d''un dépôt téléservice et la relève déclenchée de la boîte (lecture seule, aucun envoi). DÉFAUT 60, aligné sur la fenêtre echeance_detection_le. Laisse à l''accusé de réception le temps d''arriver avant de relever.';

SELECT depot_releve_delai_secondes FROM config_veille WHERE id = 1;

COMMIT;
