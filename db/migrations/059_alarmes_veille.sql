-- 059_alarmes_veille.sql — Module VEILLE PERMIS (chantier S11c) : seuils des ALARMES DE SANTÉ de la veille.
--
-- MOTIF : le bandeau de S11b détecte un ordonnanceur mort (aucun passage depuis > 2 intervalles), mais pas deux autres
-- angles morts. Deux seuils pilotables sans code les comblent :
--
--   • alerte_millesime_fige_jours (défaut 35) : nombre de jours sans NOUVEAU millésime au-delà duquel on le signale.
--     ⚠️ C'est une HYPOTHÈSE sur la cadence de publication Sitadel (mensuelle, mais à date irrégulière), à RÉVISER quand
--     l'historique réel des millésimes ingérés sera disponible (quelques mois de veille_run). Ce n'est pas un diagnostic
--     de panne : au-delà du seuil, l'écran invite seulement à vérifier la source.
--
--   • alerte_echecs_consecutifs (défaut 3) : nombre d'échecs de suite au-delà duquel on alerte. Détecte typiquement un
--     changement d'identifiant (rid) ou d'endpoint côté DiDo (l'ingestion échoue alors run après run).
--
-- SÛR : DDL additive (ADD COLUMN IF NOT EXISTS, valeurs par défaut). Aucun DROP, idempotent. GOLDEN-SAFE.
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/059_alarmes_veille.sql
-- Vérification : \d config_veille (alerte_millesime_fige_jours / alerte_echecs_consecutifs)

BEGIN;

ALTER TABLE config_veille
  ADD COLUMN IF NOT EXISTS alerte_millesime_fige_jours integer NOT NULL DEFAULT 35 CHECK (alerte_millesime_fige_jours BETWEEN 7 AND 180);
COMMENT ON COLUMN config_veille.alerte_millesime_fige_jours IS 'Jours sans NOUVEAU millésime au-delà desquels l''écran signale un possible figement. HYPOTHÈSE sur la cadence Sitadel (mensuelle, date irrégulière), à réviser avec l''historique réel. Information, pas diagnostic de panne.';

ALTER TABLE config_veille
  ADD COLUMN IF NOT EXISTS alerte_echecs_consecutifs integer NOT NULL DEFAULT 3 CHECK (alerte_echecs_consecutifs BETWEEN 1 AND 20);
COMMENT ON COLUMN config_veille.alerte_echecs_consecutifs IS 'Nombre d''échecs consécutifs au-delà duquel l''écran alerte (rouge). Détecte un changement d''identifiant/endpoint côté DiDo (échecs run après run).';

COMMIT;
