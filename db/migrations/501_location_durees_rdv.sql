-- 501_location_durees_rdv.sql — 🔴🔴 LES DURÉES D'UN RENDEZ-VOUS DU PRÉAVIS, EN RÉGLAGE (Arno, 19/11/2026).
--
-- LA DÉCISION (Arno, 19/11/2026) : « Liste de choix : 15 min, 30 min, 45 min, 1 h. Valeur par défaut : 30 min. Les durées proposées sont un réglage
-- en configuration, à côté de gestion_config.minutes_rdv (défaut 15/30/45/60 minutes, sélection par défaut 30). Pas de constante en dur. »
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL : deux réglages, à côté de `minutes_rdv` (498) et de la plage horaire (499) :
--   · durees_rdv       — défaut {15,30,45,60} — les durées proposées (en minutes) dans les fenêtres de rendez-vous du préavis ;
--   · duree_rdv_defaut — défaut 30            — la durée choisie d'office (elle doit être l'une des durées proposées).
-- VALIDATION (contrainte « gestion_config_durees_rdv_chk ») : au moins une durée, chacune de 5 à 1440 minutes, et la durée par défaut parmi elles.
-- Une valeur déjà réglée n'est jamais écrasée (ADD COLUMN IF NOT EXISTS ; contrainte posée une fois). Aucun rendez-vous touché : un rendez-vous
-- existant d'une heure et demie garde sa durée (« Personnalisée » à l'écran). Sans la 501 : le code applique les mêmes valeurs par défaut.
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe (psql -1). IDEMPOTENTE.

ALTER TABLE gestion_config ADD COLUMN IF NOT EXISTS durees_rdv smallint[] NOT NULL DEFAULT '{15,30,45,60}';
ALTER TABLE gestion_config ADD COLUMN IF NOT EXISTS duree_rdv_defaut smallint NOT NULL DEFAULT 30;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_config_durees_rdv_chk') THEN
    ALTER TABLE gestion_config ADD CONSTRAINT gestion_config_durees_rdv_chk
      CHECK (cardinality(durees_rdv) > 0 AND 5 <= ALL (durees_rdv) AND 1440 >= ALL (durees_rdv) AND duree_rdv_defaut = ANY (durees_rdv));
  END IF;
END $$;

COMMENT ON COLUMN gestion_config.durees_rdv IS
  'Rendez-vous du préavis (pré-visite, état des lieux de sortie, tâches de ces rendez-vous) : les durées proposées, en minutes (défaut 15, 30, 45, 60) — migration 501.';
COMMENT ON COLUMN gestion_config.duree_rdv_defaut IS
  'Rendez-vous du préavis : la durée choisie d''office, en minutes (défaut 30 ; l''une des durées proposées) — migration 501.';
