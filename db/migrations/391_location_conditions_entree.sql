-- 391_location_conditions_entree.sql — TUILE LOCATION (Arno, 20/10/2026) : LES « CONDITIONS D'ENTRÉE » D'UN BAIL.
--
-- LE BESOIN (Arno) : l'écran « Nouveau locataire » reprend la fiche papier « Nouveau dossier » de l'agence — dépôt de
-- garantie, prélèvement, garanties, honoraires, sommes dues à l'entrée, mode de règlement, commentaires. « Données
-- enregistrées sur le BAIL créé (une entrée = un jeu de conditions), avec trace au journal ; visibles dans la fiche du
-- locataire, modifiables par le même formulaire. » (L'entretien à prévoir est la donnée du BIEN, migration 379 : rien ici.)
--
-- CE QU'ELLE CRÉE, ET RIEN D'AUTRE (ajout seul) : la TABLE NEUVE `gestion_location_conditions_entree`.
--   · Un bail n'a pas de table : c'est l'ensemble des occupations créées par UNE entrée (les locataires × les lots
--     loués, même date). `occupation_ids` les nomme toutes ; `bail_cle` est l'identifiant stable de ce jeu de conditions.
--   · EN AJOUT SEUL : « Modifier » ajoute une ligne (même `bail_cle`, mêmes occupations) ; la plus récente fait foi, les
--     précédentes restent lisibles. Verrou EN BASE : ni UPDATE, ni DELETE, ni TRUNCATE.
--   · Les montants sont en CENTIMES entiers (aucun arrondi, aucun flottant) ; tous facultatifs. Le total n'est pas stocké :
--     il se calcule à la lecture.
-- AUCUNE ligne existante n'est lue ni modifiée ; aucune donnée n'est supprimée. Le journal (`gestion_journal`) reçoit la
-- trace de chaque saisie (auteur, date), écrite par l'application.
--
-- IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction avec son inscription.

CREATE TABLE IF NOT EXISTS gestion_location_conditions_entree (
  id                         bigserial   PRIMARY KEY,
  bail_cle                   text        NOT NULL CHECK (btrim(bail_cle) <> ''),
  occupation_ids             bigint[]    NOT NULL CHECK (cardinality(occupation_ids) > 0),
  -- Le bien choisi à l'entrée (le logement, ou la fiche autonome).
  lot_id                     bigint      NOT NULL REFERENCES gestion_annuaire_lot(id),
  depot_garantie             text        NOT NULL CHECK (depot_garantie IN ('agence', 'bailleur')),
  prelevement                boolean     NOT NULL,
  prelevement_jour           smallint    CHECK (prelevement_jour IN (5, 10)),
  garant_physique            boolean     NOT NULL,
  assurance_loyers           text        NOT NULL CHECK (assurance_loyers IN ('gli', 'visale', 'autre', 'aucune')),
  assurance_precision        text,
  honoraires_locataire       text        NOT NULL CHECK (honoraires_locataire IN ('agence', 'gestion')),
  honoraires_proprietaire    text        NOT NULL CHECK (honoraires_proprietaire IN ('agence', 'gestion')),
  prorata_loyer_centimes     bigint      CHECK (prorata_loyer_centimes >= 0),
  prorata_charges_centimes   bigint      CHECK (prorata_charges_centimes >= 0),
  depot_garantie_centimes    bigint      CHECK (depot_garantie_centimes >= 0),
  honoraires_agence_centimes bigint      CHECK (honoraires_agence_centimes >= 0),
  mode_reglement             text        NOT NULL CHECK (mode_reglement IN ('cheque', 'virement', 'autre')),
  mode_reglement_precision   text,
  commentaire                text,
  saisi_le                   timestamptz NOT NULL DEFAULT now(),
  saisi_par                  bigint,
  saisi_par_libelle          text        NOT NULL CHECK (btrim(saisi_par_libelle) <> ''),
  CONSTRAINT gestion_location_conditions_entree_jour_chk CHECK (prelevement = (prelevement_jour IS NOT NULL)),
  CONSTRAINT gestion_location_conditions_entree_assurance_chk
    CHECK (assurance_loyers NOT IN ('gli', 'autre') OR btrim(coalesce(assurance_precision, '')) <> ''),
  CONSTRAINT gestion_location_conditions_entree_reglement_chk
    CHECK (mode_reglement <> 'autre' OR btrim(coalesce(mode_reglement_precision, '')) <> '')
);
CREATE INDEX IF NOT EXISTS gestion_location_conditions_entree_bail_idx ON gestion_location_conditions_entree (bail_cle, id DESC);
CREATE INDEX IF NOT EXISTS gestion_location_conditions_entree_occupations_idx ON gestion_location_conditions_entree USING gin (occupation_ids);

CREATE OR REPLACE FUNCTION gestion_location_conditions_entree_refuser() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'gestion_location_conditions_entree : table en ajout seul (migration 391) — « Modifier » ajoute une ligne, rien ne se modifie ni ne s''efface';
END $$;

DROP TRIGGER IF EXISTS gestion_location_conditions_entree_ajout_seul ON gestion_location_conditions_entree;
CREATE TRIGGER gestion_location_conditions_entree_ajout_seul BEFORE UPDATE OR DELETE ON gestion_location_conditions_entree
  FOR EACH ROW EXECUTE FUNCTION gestion_location_conditions_entree_refuser();
DROP TRIGGER IF EXISTS gestion_location_conditions_entree_no_truncate ON gestion_location_conditions_entree;
CREATE TRIGGER gestion_location_conditions_entree_no_truncate BEFORE TRUNCATE ON gestion_location_conditions_entree
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_location_conditions_entree_refuser();

COMMENT ON TABLE gestion_location_conditions_entree IS 'Conditions d''entrée d''un bail (fiche « Nouveau dossier ») : un jeu par entrée, en ajout seul, la plus récente ligne d''un bail_cle fait foi — migration 391.';
