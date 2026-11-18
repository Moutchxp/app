-- 498_location_minutes_rdv.sql — 🔴🔴 LES MINUTES AUTORISÉES DES RENDEZ-VOUS DU PRÉAVIS, EN RÉGLAGE (Arno, 18/11/2026).
--
-- LA DÉCISION (Arno, 18/11/2026) : « MINUTES LIMITÉES À 00, 15, 30 ET 45 pour TOUS les rendez-vous qu'on fixe ou qu'on déplace […] La liste des
-- minutes autorisées est un réglage en configuration, avec 00/15/30/45 par défaut, pas une constante en dur. »
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL : `gestion_config.minutes_rdv` (entiers de 0 à 59, au moins un), défaut {0,15,30,45}. Une valeur déjà posée
-- n'est jamais écrasée (ADD COLUMN IF NOT EXISTS ; contrainte posée une fois). Aucune ligne existante modifiée, aucun rendez-vous touché :
-- un rendez-vous déjà fixé à 09h53 reste à 09h53.
-- Sans la 498 : le code applique le même défaut (minutesRdvRepo.ts). Pas de BEGIN/COMMIT : l'appel l'enveloppe (psql -1). IDEMPOTENTE.

ALTER TABLE gestion_config ADD COLUMN IF NOT EXISTS minutes_rdv smallint[] NOT NULL DEFAULT '{0,15,30,45}';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_config_minutes_rdv_chk') THEN
    ALTER TABLE gestion_config ADD CONSTRAINT gestion_config_minutes_rdv_chk
      CHECK (cardinality(minutes_rdv) > 0 AND 0 <= ALL (minutes_rdv) AND 59 >= ALL (minutes_rdv));
  END IF;
END $$;

COMMENT ON COLUMN gestion_config.minutes_rdv IS
  'Les minutes autorisées pour l''heure de début et de fin d''un rendez-vous du préavis (pré-visite, état des lieux de sortie) qu''on fixe ou qu''on déplace (migration 498).';
