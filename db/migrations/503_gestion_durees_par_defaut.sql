-- 503_gestion_durees_par_defaut.sql — 🔴🔴 LES DURÉES PAR DÉFAUT, EN RÉGLAGE (Arno, 19/11/2026).
--
-- LA DÉCISION (Arno, 19/11/2026) : « DURÉES PAR DÉFAUT (réglages en configuration, pas de constante en dur) : pré-visite : 30 min ; état des lieux
-- de sortie : 1 h ; tâche qui est un rendez-vous : 30 min ; tâche qui n'est pas un rendez-vous : 15 min. Ces valeurs s'appliquent à la création.
-- Pour une MODIFICATION, la durée affichée est celle du rendez-vous actuel. »
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL : quatre réglages (minutes), à côté des durées proposées (501) :
--   · duree_defaut_previsite    — défaut 30 — la durée d'office d'une pré-visite qu'on fixe ;
--   · duree_defaut_edl          — défaut 60 — la durée d'office d'un état des lieux de sortie qu'on planifie ;
--   · duree_defaut_rdv_tache    — défaut 30 — la durée d'office d'une tâche « Rendez-vous » qu'on crée ;
--   · duree_defaut_tache        — défaut 15 — la place dans l'agenda d'une tâche qui n'est pas un rendez-vous.
-- VALIDATION (contrainte « gestion_config_durees_defaut_chk ») : chacune de 5 à 1440 minutes. Une valeur déjà réglée n'est jamais écrasée
-- (ADD COLUMN IF NOT EXISTS ; contrainte posée une fois). Aucun rendez-vous, aucune tâche touchés : la durée d'un rendez-vous existant est la sienne.
-- `gestion_config.duree_rdv_defaut` (501) n'est plus lue pour ces fenêtres : les durées d'office de chaque sorte la remplacent.
-- Sans la 503 : le code applique les mêmes valeurs par défaut. Pas de BEGIN/COMMIT : l'appel l'enveloppe (psql -1). IDEMPOTENTE.

ALTER TABLE gestion_config ADD COLUMN IF NOT EXISTS duree_defaut_previsite smallint NOT NULL DEFAULT 30;
ALTER TABLE gestion_config ADD COLUMN IF NOT EXISTS duree_defaut_edl smallint NOT NULL DEFAULT 60;
ALTER TABLE gestion_config ADD COLUMN IF NOT EXISTS duree_defaut_rdv_tache smallint NOT NULL DEFAULT 30;
ALTER TABLE gestion_config ADD COLUMN IF NOT EXISTS duree_defaut_tache smallint NOT NULL DEFAULT 15;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_config_durees_defaut_chk') THEN
    ALTER TABLE gestion_config ADD CONSTRAINT gestion_config_durees_defaut_chk
      CHECK (duree_defaut_previsite BETWEEN 5 AND 1440 AND duree_defaut_edl BETWEEN 5 AND 1440
         AND duree_defaut_rdv_tache BETWEEN 5 AND 1440 AND duree_defaut_tache BETWEEN 5 AND 1440);
  END IF;
END $$;

COMMENT ON COLUMN gestion_config.duree_defaut_previsite IS 'Durée d''office (minutes) d''une pré-visite qu''on fixe (défaut 30) — migration 503.';
COMMENT ON COLUMN gestion_config.duree_defaut_edl IS 'Durée d''office (minutes) d''un état des lieux de sortie qu''on planifie (défaut 60) — migration 503.';
COMMENT ON COLUMN gestion_config.duree_defaut_rdv_tache IS 'Durée d''office (minutes) d''une tâche « Rendez-vous » qu''on crée (défaut 30) — migration 503.';
COMMENT ON COLUMN gestion_config.duree_defaut_tache IS 'Place dans l''agenda (minutes) d''une tâche qui n''est pas un rendez-vous (défaut 15) — migration 503.';
