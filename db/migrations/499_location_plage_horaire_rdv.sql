-- 499_location_plage_horaire_rdv.sql — 🔴🔴 LA PLAGE HORAIRE DES RENDEZ-VOUS DU PRÉAVIS, EN RÉGLAGE (Arno, 19/11/2026).
--
-- LA DÉCISION (Arno, 19/11/2026) : « HEURE DE DÉBUT : de 8h00 à 20h00 […] HEURE DE FIN : de 8h15 à 21h00 au plus tard […] les bornes (début au plus
-- tôt 8h00, début au plus tard 20h00, fin au plus tard 21h00) sont des réglages en configuration, à côté de gestion_config.minutes_rdv. »
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL : trois réglages de type HEURE (time), à côté de `minutes_rdv` (498) :
--   · rdv_debut_au_plus_tot  — défaut 08:00 — l'heure la plus tôt à laquelle un rendez-vous peut COMMENCER ;
--   · rdv_debut_au_plus_tard — défaut 20:00 — l'heure la plus tard à laquelle un rendez-vous peut COMMENCER ;
--   · rdv_fin_au_plus_tard   — défaut 21:00 — l'heure la plus tard à laquelle un rendez-vous peut SE TERMINER.
-- VALIDATION (contrainte « gestion_config_plage_rdv_chk ») : début au plus tôt AVANT début au plus tard, et début au plus tard AU PLUS TARD à la fin
-- au plus tard — sinon la valeur est refusée. Une valeur déjà réglée n'est jamais écrasée (ADD COLUMN IF NOT EXISTS ; contrainte posée une fois).
-- Aucun rendez-vous touché : un rendez-vous déjà fixé à 22h00 reste à 22h00. Sans la 499 : le code applique les mêmes valeurs par défaut.
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe (psql -1). IDEMPOTENTE.

ALTER TABLE gestion_config ADD COLUMN IF NOT EXISTS rdv_debut_au_plus_tot time NOT NULL DEFAULT '08:00';
ALTER TABLE gestion_config ADD COLUMN IF NOT EXISTS rdv_debut_au_plus_tard time NOT NULL DEFAULT '20:00';
ALTER TABLE gestion_config ADD COLUMN IF NOT EXISTS rdv_fin_au_plus_tard time NOT NULL DEFAULT '21:00';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_config_plage_rdv_chk') THEN
    ALTER TABLE gestion_config ADD CONSTRAINT gestion_config_plage_rdv_chk
      CHECK (rdv_debut_au_plus_tot < rdv_debut_au_plus_tard AND rdv_debut_au_plus_tard <= rdv_fin_au_plus_tard);
  END IF;
END $$;

COMMENT ON COLUMN gestion_config.rdv_debut_au_plus_tot IS
  'Rendez-vous du préavis : l''heure la plus tôt pour COMMENCER (heure, défaut 08:00 ; doit être avant « début au plus tard ») — migration 499.';
COMMENT ON COLUMN gestion_config.rdv_debut_au_plus_tard IS
  'Rendez-vous du préavis : l''heure la plus tard pour COMMENCER (heure, défaut 20:00 ; au plus tard à « fin au plus tard ») — migration 499.';
COMMENT ON COLUMN gestion_config.rdv_fin_au_plus_tard IS
  'Rendez-vous du préavis : l''heure la plus tard pour SE TERMINER (heure, défaut 21:00 ; après « début au plus tard » ou égale) — migration 499.';
