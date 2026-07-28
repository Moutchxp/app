-- 060_etat_dau.sql — Module VEILLE PERMIS (chantier S12) : état d'avancement du dossier + dates de chantier.
--
-- MOTIF : suivre ce que devient un permis après l'autorisation, pour (a) ne plus écrire aux mairies pour un permis
-- ANNULÉ, (b) savoir qu'un chantier est ouvert/achevé (le bâtiment existe → c'est sa hauteur qu'on cherche), (c) laisser
-- proposables les dossiers qui avaient « disparu » du périmètre en quittant l'état 2. Les trois colonnes viennent du CSV
-- Sitadel (déjà téléchargé) : ETAT_DAU (col. 8), DATE_REELLE_DOC (col. 10), DATE_REELLE_DAACT (col. 11).
--
-- SIGNIFICATION DES CODES ETAT_DAU (source OFFICIELLE : dictionnaire SDES « Variables des permis de construire des
-- logements », pièce jointe DiDo rid ab799b04-0b03-4f96-949c-eb23c478a8e8, dataset Sitadel sur
-- data.statistiques.developpement-durable.gouv.fr) :
--     2 = Autorisé   4 = Annulé   5 = Commencé (chantier ouvert)   6 = Terminé (travaux achevés)
-- Les colonnes DiDo confirment : DATE_REELLE_DOC = « Date réelle d'ouverture de chantier »,
-- DATE_REELLE_DAACT = « Date réelle d'achèvement des travaux ». (Pour les PD, ETAT_PD suit la même codification.)
-- Une valeur inattendue (ex. la ligne corrompue « 32 » observée au national) est stockée TELLE QUELLE, sans sens en aval.
--
-- ⚠️ Les trois colonnes sont NULL pour tout dossier NON REVU depuis cet ajout : elles ne se remplissent qu'au prochain
-- passage de l'ingestion (qui rafraîchit l'état des dossiers connus réapparus dans le millésime courant).
--
-- SÛR : DDL additive (ADD COLUMN IF NOT EXISTS, colonnes nullables) + un index partiel. Aucun DROP, idempotent.
-- GOLDEN-SAFE : aucun contact moteur/score/certificat/batiment.
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/060_etat_dau.sql
-- Vérification : \d sitadel_dossier (etat_dau / date_doc / date_daact)

BEGIN;

ALTER TABLE sitadel_dossier ADD COLUMN IF NOT EXISTS etat_dau  text;  -- 2=Autorisé 4=Annulé 5=Commencé 6=Terminé (LIVE, rafraîchi ; distinct de `etat` figé à la 1re rétention)
ALTER TABLE sitadel_dossier ADD COLUMN IF NOT EXISTS date_doc  date;  -- date réelle d'ouverture de chantier (DOC)
ALTER TABLE sitadel_dossier ADD COLUMN IF NOT EXISTS date_daact date; -- date réelle d'achèvement des travaux (DAACT)

COMMENT ON COLUMN sitadel_dossier.etat_dau IS 'État d''avancement du projet (Sitadel), LIVE : 2=Autorisé, 4=Annulé, 5=Commencé, 6=Terminé (source : dictionnaire SDES des variables PC logements). Valeur inattendue stockée telle quelle. NULL tant que le dossier n''a pas été revu depuis l''ajout.';
COMMENT ON COLUMN sitadel_dossier.date_doc IS 'Date réelle d''ouverture de chantier (DATE_REELLE_DOC). NULL si non déclarée.';
COMMENT ON COLUMN sitadel_dossier.date_daact IS 'Date réelle d''achèvement des travaux (DATE_REELLE_DAACT). NULL si non déclarée.';

-- Index partiel pour l'exclusion « annulé » (état 4) et le filtre/affichage par état — ne couvre que les lignes revues.
CREATE INDEX IF NOT EXISTS sitadel_dossier_etat_dau_idx ON sitadel_dossier (etat_dau) WHERE etat_dau IS NOT NULL;

COMMIT;
