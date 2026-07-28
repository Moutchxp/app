-- 061_etat_ambigu.sql — Module VEILLE PERMIS (chantier S12b) : marqueur d'état AMBIGU.
--
-- MOTIF : un même dossier (NUM_DAU) porte souvent plusieurs lignes dans les CSV Sitadel (logements/locaux, tranches),
-- parfois avec des ETAT_DAU DIVERGENTS (mesuré sur le périmètre 2026-07 : 638 dossiers multi-états, dont 65 avec une
-- ligne « annulé » ET une non annulée). L'ingestion écrit désormais un état AGRÉGÉ DÉTERMINISTE (cf. agregerEtat :
-- annulé seulement si TOUTES les lignes le sont, sinon le plus avancé non annulé), et pose `etat_ambigu = true` quand les
-- lignes ne s'accordaient pas — pour le SIGNALER discrètement à l'écran. Un état ambigu reste PROPOSABLE (l'ambiguïté
-- n'exclut pas : mieux vaut un courrier de trop qu'un immeuble manqué).
--
-- ⚠️ `etat_ambigu` vaut false pour tout dossier non revu depuis l'ajout ; il se calcule au prochain passage d'ingestion.
--
-- SÛR : DDL additive (ADD COLUMN IF NOT EXISTS, DEFAULT false). Aucun DROP, idempotent. GOLDEN-SAFE.
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/061_etat_ambigu.sql
-- Vérification : \d sitadel_dossier (etat_ambigu)

BEGIN;

ALTER TABLE sitadel_dossier ADD COLUMN IF NOT EXISTS etat_ambigu boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN sitadel_dossier.etat_ambigu IS 'true si les lignes du dossier portaient des ETAT_DAU divergents (≥ 2 états distincts). Informatif — l''état stocké est l''agrégat déterministe (agregerEtat) ; l''ambiguïté n''exclut jamais des demandes. false tant que le dossier n''a pas été revu depuis l''ajout.';

COMMIT;
