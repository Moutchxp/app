-- 044_internaute_commercial_view.sql — Module INTERNAUTE : VUE COMMERCIALE (frontière classé / livraison, PAR CONSTRUCTION).
--
-- MOTIF : « client commercial » vs « simple destinataire d'un PDF » ne se distingue aujourd'hui QUE par la présence/
-- absence de consentement — implicite et fragile. Un futur `FROM internaute` non filtré raflerait un destinataire dans
-- une extraction commerciale (détournement de finalité : l'e-mail de LIVRAISON servirait au marketing). Cette vue rend
-- la frontière INFRANCHISSABLE PAR CONSTRUCTION : `internaute_commercial` = les internautes NON effacés ayant AU MOINS
-- UN consentement ACTIF. Tout le code commercial (liste, compte, export, communes, bornes de dates) lit CETTE vue,
-- jamais la table `internaute` brute → un destinataire sans consentement en est ABSENT sans dépendre de la discipline du
-- développeur.
--
-- ⚠️ NE PAS confondre avec les chemins NON commerciaux qui DOIVENT voir tous les internautes et restent sur la table
-- brute : get-or-create (ingestion), effacement/purge (cycle de vie RGPD), vérification technique 'tous', détail par id,
-- dossier de preuve désabonnement (piloté par l'historique de retrait). Cf. compte rendu du chantier.
--
-- CE LOT NE CRÉE AUCUNE LIGNE et ne déplace AUCUNE garde : il POSE seulement la frontière. La création d'un profil de
-- LIVRAISON sans consentement est un lot SÉPARÉ (Commit 2).
--
-- SÛR : DDL uniquement (une vue), AUCUNE écriture de données, AUCUN DROP de table/colonne. Idempotent (CREATE OR REPLACE).
-- GOLDEN-SAFE : aucun contact moteur / config_scoring → golden 29.107259068449615 inchangé.
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/044_internaute_commercial_view.sql
-- Vérification : SELECT count(*) FROM internaute_commercial;  -- = internautes NON effacés avec ≥1 consentement actif

BEGIN;

-- Plancher commercial : NON effacé ET au moins un consentement actif (n'importe lequel des 3). La contrainte de statut
-- SPÉCIFIQUE (intersection F1/F2/F3) reste ajoutée par le code (`clauseStatuts`) ; la vue est le garde-fou structurel.
CREATE OR REPLACE VIEW internaute_commercial AS
  SELECT i.*
  FROM internaute i
  WHERE i.efface_a IS NULL
    AND EXISTS (
      SELECT 1 FROM internaute_consentement_actif ca
      WHERE ca.internaute_id = i.id AND ca.actif = true
    );

COMMIT;
