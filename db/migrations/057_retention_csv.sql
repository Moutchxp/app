-- 057_retention_csv.sql — Module VEILLE PERMIS (correctif S11a-FIX) : rétention des CSV Sitadel portée à 7 jours.
--
-- MOTIF : la purge (chantier S11a) ne doit JAMAIS supprimer les CSV du millésime ACTUELLEMENT EN BASE — c'est ce cache
-- qui rend un re-run gratuit ; le supprimer garantit un re-téléchargement de ~880 Mo. Le code applique désormais cette
-- règle (fichiersCsvAPurger protège le millésime courant et ne vise que les millésimes ANTÉRIEURS). Côté données, on
-- desserre la rétention par défaut : 0 (« supprimer dès le succès ») était trop agressif — on garde les CSV des
-- millésimes antérieurs 7 jours (fenêtre de diagnostic / rollback), le millésime courant restant de toute façon protégé.
--
-- SÛR : ALTER DEFAULT + un UPDATE ciblé du singleton (id=1). Aucun DROP, aucune écriture destructive. GOLDEN-SAFE.
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/057_retention_csv.sql
-- Vérification : SELECT csv_retention_jours FROM config_veille WHERE id = 1;  -- attendu : 7

BEGIN;

ALTER TABLE config_veille ALTER COLUMN csv_retention_jours SET DEFAULT 7;
UPDATE config_veille SET csv_retention_jours = 7 WHERE id = 1;

COMMENT ON COLUMN config_veille.csv_retention_jours IS 'Rétention (jours) des CSV de millésimes ANTÉRIEURS après un run RÉUSSI. Défaut 7. Le millésime ACTUELLEMENT EN BASE n''est JAMAIS purgé (cache d''un re-run gratuit). La purge n''a lieu que sur ''succes'', jamais sur ''rien_a_faire'' ni ''echec''.';

COMMIT;
