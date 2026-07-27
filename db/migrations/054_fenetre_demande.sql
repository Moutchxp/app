-- 054_fenetre_demande.sql — Module VEILLE PERMIS (chantier S7c) : fenêtre d'ancienneté des demandes de communication.
--
-- MOTIF (à conserver) : la CIBLE d'une demande de pièces (PC2 plan de masse coté, PC3 plan en coupe) est un bâtiment
-- RÉCENT que le relevé LiDAR HD ne voit pas ENCORE — on demande ces pièces pour connaître la hauteur du bâti neuf avant
-- son intégration au MNS. Passé un certain âge, le bâtiment est DÉJÀ construit et MESURÉ par le LiDAR : sa hauteur est
-- lisible directement, la demande devient inutile (et coûte du temps à la mairie comme à nous). D'où une borne
-- d'ancienneté PILOTABLE SANS CODE : au-delà de `anciennete_max_demande_annees` années depuis la date réelle
-- d'autorisation, le dossier n'est plus proposé à la demande. Défaut 3 ans (ordre de grandeur du décalage LiDAR).
--
-- Nouvelle colonne sur le singleton `config_veille` (id=1) : `anciennete_max_demande_annees`. Lue au runtime par
-- `proposerLots` via `ParamsLot.dateMin` (= aujourd'hui − N années). Un dossier SANS date d'autorisation est de toute
-- façon exclu (pertinence non jugeable) — cf. `app/lib/sitadel/demande.ts`.
--
-- SÛR : DDL additive seulement (ADD COLUMN IF NOT EXISTS + DEFAULT). Aucun DROP, aucune écriture de données, idempotent.
-- GOLDEN-SAFE : aucun contact moteur/config_scoring/batiment → golden 29.107259068449615 intact. N'ENVOIE RIEN.
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/054_fenetre_demande.sql
-- Vérification : \d config_veille · SELECT anciennete_max_demande_annees FROM config_veille;

BEGIN;

ALTER TABLE config_veille
  ADD COLUMN IF NOT EXISTS anciennete_max_demande_annees integer NOT NULL DEFAULT 3
    CHECK (anciennete_max_demande_annees BETWEEN 1 AND 20);

COMMENT ON COLUMN config_veille.anciennete_max_demande_annees IS
  'Fenêtre d''ancienneté des demandes (années) : au-delà, le bâtiment est déjà mesuré au LiDAR (MNS) et la demande de pièces devient inutile. Un dossier sans date d''autorisation est exclu. Lue au runtime par proposerLots (ParamsLot.dateMin).';

COMMIT;
