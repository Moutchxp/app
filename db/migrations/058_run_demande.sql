-- 058_run_demande.sql — Module VEILLE PERMIS (chantier S11b) : drapeau de « demande d'exécution immédiate ».
--
-- MOTIF : l'écran d'administration ne peut PAS lancer l'ingestion lui-même. Un run dure ~7 minutes (téléchargement
-- ~880 Mo + UPSERT), ce qui est incompatible avec le cycle d'une requête HTTP ; et un processus détaché depuis le serveur
-- web ne survivrait pas à un redémarrage / une mise en production. Le bouton « Lancer maintenant » pose donc un simple
-- DRAPEAU horodaté ; c'est l'ORDONNANCEUR (launchd, qui passe tous les quarts d'heure) qui le consomme au prochain
-- passage en appelant `executerVeille`. Le serveur web ne fait jamais le travail lourd.
--
-- `run_demande_le` : NULL = aucune demande en attente ; sinon = horodatage de la demande. Il est remis à NULL au
-- DÉMARRAGE du run qui le consomme, dans la même transaction que l'insertion de la ligne veille_run (pour qu'un plantage
-- ne laisse pas une demande qui se rejoue indéfiniment).
--
-- SÛR : DDL additive (ADD COLUMN IF NOT EXISTS, colonne nullable). Aucun DROP, aucune écriture destructive. GOLDEN-SAFE.
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/058_run_demande.sql
-- Vérification : \d config_veille  (colonne run_demande_le)

BEGIN;

ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS run_demande_le timestamptz;
COMMENT ON COLUMN config_veille.run_demande_le IS 'Drapeau « demande d''exécution immédiate » posé par l''écran (bouton « Lancer maintenant »). NULL = aucune demande. L''ordonnanceur (launchd) le consomme au prochain passage et le remet à NULL au démarrage du run, dans la même transaction que l''insertion de veille_run. Le serveur web ne lance jamais l''ingestion lui-même (trop longue pour une requête HTTP).';

COMMIT;
