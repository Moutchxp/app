-- 370_gestion_honoraires_gestion.sql — LOT L1 (étude Location, validé par Arno le 17/10/2026) : LOYER DE DÉPART,
-- TAUX DE GESTION ET HONORAIRES DE GESTION.
--
-- LE BESOIN (Arno, 17/10/2026) : « à l'entrée d'un logement, saisir le LOYER MENSUEL DE DÉPART et le TAUX DE GESTION
-- (%). Les ranger sur la location, les afficher sur la carte du locataire ET sur le bien. L'historique est conservé à
-- chaque changement de locataire. En déduire les HONORAIRES DE GESTION générés par chaque lot = loyer × taux, avec une
-- vue par lot, par propriétaire et en total agence, mensuelle et annuelle. »
--
-- CE QU'ELLE CRÉE, ET RIEN D'AUTRE (ajout seul) :
--   · deux colonnes facultatives sur `gestion_annuaire_lot` : `taux_honos_wippimmo` et `base_honos_wippimmo`, que
--     l'import écrit depuis « Tx honos » et « Base honos » de Lots.xlsx (référence WIPPIMMO, jamais saisies ici) ;
--   · TABLE NEUVE `gestion_location_conditions` — les conditions d'UNE location (une occupation = un lot × un
--     locataire) : loyer HC de départ, provisions, taux de gestion HT, base (charges comprises ou hors charges).
--     EN AJOUT SEUL : une correction ajoute une ligne, la précédente reste lisible ; la plus récente fait foi.
--     Un changement de locataire ouvre une nouvelle occupation, donc de nouvelles conditions : l'historique est
--     conservé par construction. `loyer_hc` est FACULTATIF : une location reprise sans loyer connu n'en invente pas ;
--   · TABLE NEUVE `gestion_honoraires_reglage` (une seule ligne) — les réglages agence modifiables sans code : taux
--     par défaut (4,5 % HT, valeur la plus fréquente des exports WIPPIMMO : 191 lots sur 365) et base par défaut
--     (charges comprises : 363 lots sur 365) ;
--   · TABLE NEUVE `gestion_reglage_date` — les réglages DATÉS (valeur + date d'effet), en ajout seul : ici la TVA sur
--     honoraires (20 % depuis le 01/01/2014).
--
-- AUCUNE ligne existante n'est lue ni modifiée ; aucune donnée n'est supprimée. La reprise du taux WIPPIMMO sur les
-- locations en cours se fait APRÈS, par la commande `gestion:honoraires:reprendre` (simulation par défaut), qui
-- n'écrit que dans la table neuve.
--
-- IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction avec son inscription.

ALTER TABLE gestion_annuaire_lot
  ADD COLUMN IF NOT EXISTS taux_honos_wippimmo numeric,
  ADD COLUMN IF NOT EXISTS base_honos_wippimmo text;

CREATE TABLE IF NOT EXISTS gestion_location_conditions (
  id                  bigserial   PRIMARY KEY,
  occupation_id       bigint      NOT NULL REFERENCES gestion_annuaire_occupation(id),
  loyer_hc            numeric     CHECK (loyer_hc IS NULL OR loyer_hc >= 0),
  provisions          numeric     CHECK (provisions IS NULL OR provisions >= 0),
  taux_gestion_ht     numeric     NOT NULL CHECK (taux_gestion_ht >= 0 AND taux_gestion_ht <= 100),
  base                text        NOT NULL CHECK (base IN ('cc', 'hc')),
  origine             text        NOT NULL CHECK (origine IN ('saisie', 'reprise')),
  saisi_le            timestamptz NOT NULL DEFAULT now(),
  saisi_par           bigint      REFERENCES admin_utilisateur(id),
  saisi_par_libelle   text        NOT NULL CHECK (btrim(saisi_par_libelle) <> '')
);
CREATE INDEX IF NOT EXISTS gestion_location_conditions_occupation_idx
  ON gestion_location_conditions (occupation_id, id DESC);

CREATE OR REPLACE FUNCTION gestion_ajout_seul_refuser() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% : table en ajout seul (migration 370) — une correction ajoute une ligne, rien ne se modifie ni ne s''efface', TG_TABLE_NAME;
END $$;

DROP TRIGGER IF EXISTS gestion_location_conditions_ajout_seul ON gestion_location_conditions;
CREATE TRIGGER gestion_location_conditions_ajout_seul BEFORE UPDATE OR DELETE ON gestion_location_conditions
  FOR EACH ROW EXECUTE FUNCTION gestion_ajout_seul_refuser();
DROP TRIGGER IF EXISTS gestion_location_conditions_no_truncate ON gestion_location_conditions;
CREATE TRIGGER gestion_location_conditions_no_truncate BEFORE TRUNCATE ON gestion_location_conditions
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_ajout_seul_refuser();

CREATE TABLE IF NOT EXISTS gestion_honoraires_reglage (
  id                   smallint    PRIMARY KEY CHECK (id = 1),
  taux_defaut_ht       numeric     NOT NULL CHECK (taux_defaut_ht >= 0 AND taux_defaut_ht <= 100),
  base_defaut          text        NOT NULL CHECK (base_defaut IN ('cc', 'hc')),
  modifie_le           timestamptz NOT NULL DEFAULT now(),
  modifie_par_libelle  text        NOT NULL CHECK (btrim(modifie_par_libelle) <> '')
);
INSERT INTO gestion_honoraires_reglage (id, taux_defaut_ht, base_defaut, modifie_par_libelle)
VALUES (1, 4.5, 'cc', 'migration 370')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS gestion_reglage_date (
  id                  bigserial   PRIMARY KEY,
  cle                 text        NOT NULL CHECK (cle IN ('tva_honoraires')),
  valeur              numeric     NOT NULL CHECK (valeur >= 0 AND valeur <= 100),
  depuis              date        NOT NULL,
  saisi_le            timestamptz NOT NULL DEFAULT now(),
  saisi_par_libelle   text        NOT NULL CHECK (btrim(saisi_par_libelle) <> '')
);
CREATE INDEX IF NOT EXISTS gestion_reglage_date_cle_idx ON gestion_reglage_date (cle, depuis DESC, id DESC);
DROP TRIGGER IF EXISTS gestion_reglage_date_ajout_seul ON gestion_reglage_date;
CREATE TRIGGER gestion_reglage_date_ajout_seul BEFORE UPDATE OR DELETE ON gestion_reglage_date
  FOR EACH ROW EXECUTE FUNCTION gestion_ajout_seul_refuser();
DROP TRIGGER IF EXISTS gestion_reglage_date_no_truncate ON gestion_reglage_date;
CREATE TRIGGER gestion_reglage_date_no_truncate BEFORE TRUNCATE ON gestion_reglage_date
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_ajout_seul_refuser();
INSERT INTO gestion_reglage_date (cle, valeur, depuis, saisi_par_libelle)
SELECT 'tva_honoraires', 20, DATE '2014-01-01', 'migration 370'
 WHERE NOT EXISTS (SELECT 1 FROM gestion_reglage_date WHERE cle = 'tva_honoraires');

COMMENT ON COLUMN gestion_annuaire_lot.taux_honos_wippimmo IS 'Taux d''honoraires de gestion HT du lot selon WIPPIMMO (« Tx honos » de Lots.xlsx), écrit par l''import. Référence, jamais saisie ici (migration 370).';
COMMENT ON COLUMN gestion_annuaire_lot.base_honos_wippimmo IS 'Base des honoraires selon WIPPIMMO (« Base honos », ex. LCDTA : L = loyer, C = charges), écrite par l''import (migration 370).';
COMMENT ON TABLE gestion_location_conditions IS 'Conditions d''une location (occupation) : loyer HC de départ, provisions, taux de gestion HT, base. Ajout seul ; la ligne la plus récente fait foi (lot L1, migration 370).';
COMMENT ON TABLE gestion_honoraires_reglage IS 'Réglages agence des honoraires de gestion : taux par défaut HT, base par défaut (migration 370).';
COMMENT ON TABLE gestion_reglage_date IS 'Réglages datés (valeur + date d''effet), ajout seul : TVA sur honoraires (migration 370).';
