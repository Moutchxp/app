-- 157_alerte_obstacle_disparu.sql — ALERTE « un bâtiment qui fondait un certificat a disparu » (à revérifier).
--
-- CONTEXTE : le verdict se recalcule sur le bâti COURANT. Quand un cleabs disparaît d'une nouvelle édition BD TOPO et que son
-- emplacement n'est plus couvert par du bâti, l'obstacle s'évapore et un PROCHAIN calcul certifierait une vue dégagée qui ne l'est
-- pas. Les certificats déjà émis sont figés (conservateurs) ; le danger est le calcul suivant. Le chantier précédent capture le
-- cleabs de l'obstacle dans le snapshot du certificat → on peut désormais croiser et ALERTER (jamais recertifier).
--
-- CE LOT AJOUTE DEUX OBJETS, strictement ADDITIFS :
-- ① config_veille.obstacle_disparu_alerte_active (boolean, DEFAULT false) — INTERRUPTEUR (opt-in, comme relance_auto_active /
--    attente_bati_alerte_active / rattachement_suivi_auto_active). Appliquer la migration ne déclenche rien.
-- ② TABLE alerte_obstacle_disparu — MARQUEUR anti-doublon : une ligne par (certificat × cleabs disparu). Garantit UN SEUL rappel
--    par certificat et par disparition constatée (jamais un mail à chaque tick). Miroir des tables d'idempotence alerte_ged /
--    alerte_attente_bati. FK certificat ON DELETE CASCADE (le marqueur suit le certificat).
--
-- 🔴 GARDE : ce lot ne touche NI le moteur de verdict SVAV, NI le golden Asnières, NI une altitude, NI aucun invariant, et
--    N'ÉCRIT JAMAIS sur un certificat existant (aucune recertification, aucun recalcul). Le croisement lit le bâti BD TOPO RÉEL
--    (bdtopo_batiment / batiment), JAMAIS l'emprise projetée. Alerte seulement (régime « à revérifier »).
--
-- SÛR : ADD COLUMN / CREATE TABLE « IF NOT EXISTS ». Aucun DROP, aucune écriture de données. GOLDEN-SAFE. Idempotente. Une seule
-- transaction. AUCUN ENVOI. Requiert config_veille (048) et certificat (031). Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/157_alerte_obstacle_disparu.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

-- ① INTERRUPTEUR (opt-in, défaut false).
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS obstacle_disparu_alerte_active boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN config_veille.obstacle_disparu_alerte_active IS
  'ALERTE — prévenir par e-mail quand un bâtiment qui fondait un certificat a disparu de BD TOPO (emplacement réellement vidé) ? Opt-in (défaut false). Alerte « à revérifier », JAMAIS une recertification. Désactiver retire le SIGNAL, pas le problème : le verdict continuera de bouger au prochain calcul.';

-- ② MARQUEUR anti-doublon — un rappel par certificat et par disparition.
CREATE TABLE IF NOT EXISTS alerte_obstacle_disparu (
  certificat_id bigint      NOT NULL REFERENCES certificat(id) ON DELETE CASCADE,
  cleabs        text        NOT NULL,   -- le bâtiment (obstacle du certificat) constaté disparu
  alerte_le     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (certificat_id, cleabs)
);

COMMENT ON TABLE alerte_obstacle_disparu IS
  'ALERTE — idempotence : une ligne = ce certificat a reçu son rappel « obstacle disparu » pour ce cleabs. Empêche un second mail à chaque tick (un seul rappel par certificat et par disparition constatée).';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--   SELECT column_name, column_default FROM information_schema.columns
--     WHERE table_name='config_veille' AND column_name='obstacle_disparu_alerte_active'; -- boolean, false
--   SELECT to_regclass('public.alerte_obstacle_disparu'); -- non NULL
