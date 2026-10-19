-- 388_gestion_dossier_attitre_bien.sql — LE DOSSIER ATTITRÉ D'UN BIEN, ET LE RAPPROCHEMENT DES BIENS (Arno, 19/10/2026).
--
-- LE BESOIN : après le rangement des dossiers copiés (commit ffb8affc), le bouton Drive d'une fiche propriétaire ouvre son
-- dossier attitré. Un propriétaire à plusieurs dossiers copiés reçoit une RACINE (un dossier qui les réunit), et chacun de
-- ses BIENS doit ouvrir SON dossier copié. Le bien n'avait pas de dossier attitré : son bouton lisait l'ancienne
-- arborescence (« 2 Biens immobiliers », gestion_drive_arbre).
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE (ajout seul) :
--   · une colonne NULLABLE `gestion_annuaire_lot.drive_dossier_id` : le dossier attitré du bien. Vide = repli d'affichage,
--     dans le code (dossier du propriétaire, puis racine « Base de données locative »). Aucune donnée écrite ici : le
--     repointage est l'étape F, lancée par Arno, en une transaction.
--   · deux tables neuves, en ajout seul, pour l'écran « Rapprochement des dossiers clients », section « Biens » :
--     `gestion_rapprochement_bien_proposition` (une ligne par bien, telle que le calcul l'a produite) et
--     `gestion_rapprochement_bien_decision` (le journal des décisions : Valider, Corriger, Aucun rattachement).
--   · Verrou EN BASE : ni UPDATE, ni DELETE, ni TRUNCATE sur les deux tables neuves.
--
-- IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction avec son inscription.

ALTER TABLE gestion_annuaire_lot ADD COLUMN IF NOT EXISTS drive_dossier_id text;

CREATE TABLE IF NOT EXISTS gestion_rapprochement_bien_proposition (
  id bigserial PRIMARY KEY,
  -- L'étiquette du calcul (ex. « 2026-10-19-biens ») : l'écran lit le plus récent.
  calcul text NOT NULL,
  lot_id bigint NOT NULL REFERENCES gestion_annuaire_lot(id),
  -- La clé WIPPIMMO du bien au calcul : un chargement dans une autre base doit retrouver la même.
  lot_wippimmo_id text NOT NULL,
  proprietaire_id bigint NOT NULL REFERENCES gestion_annuaire_proprietaire(id),
  -- Le dossier copié proposé (ou son sous-dossier au nom de l'adresse du bien) ; vide pour un AMBIGU sans piste.
  dossier_id text,
  dossier_nom text,
  niveau text NOT NULL CONSTRAINT gestion_rapprochement_bien_proposition_niveau_chk CHECK (niveau IN ('SUR', 'PROBABLE', 'AMBIGU')),
  -- La raison en clair, telle que l'écran l'affiche (« commune Ville A + locataire actuel DUPONT »).
  raison text NOT NULL,
  -- Les dossiers entre lesquels « Corriger » choisit : [{ "id": …, "nom": … }].
  candidats jsonb NOT NULL DEFAULT '[]'::jsonb,
  cree_le timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS gestion_rapprochement_bien_proposition_uniq
  ON gestion_rapprochement_bien_proposition (calcul, lot_id);

CREATE TABLE IF NOT EXISTS gestion_rapprochement_bien_decision (
  id bigserial PRIMARY KEY,
  proposition_id bigint NOT NULL REFERENCES gestion_rapprochement_bien_proposition(id),
  -- « valider » (le dossier proposé), « corriger » (un autre dossier, parmi les candidats), « aucun » (aucun rattachement).
  geste text NOT NULL CONSTRAINT gestion_rapprochement_bien_decision_geste_chk CHECK (geste IN ('valider', 'corriger', 'aucun')),
  dossier_id text,
  decide_le timestamptz NOT NULL DEFAULT now(),
  decide_par bigint,
  decide_par_libelle text NOT NULL,
  CONSTRAINT gestion_rapprochement_bien_decision_dossier_chk CHECK ((geste = 'aucun') = (dossier_id IS NULL))
);
CREATE INDEX IF NOT EXISTS gestion_rapprochement_bien_decision_par_proposition
  ON gestion_rapprochement_bien_decision (proposition_id, id DESC);

-- Le verrou : ajout seul, sur les deux tables neuves.
CREATE OR REPLACE FUNCTION gestion_rapprochement_bien_ajout_seul() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% : ajout seul (% refusé) — migration 388', TG_TABLE_NAME, TG_OP;
END $$;
DROP TRIGGER IF EXISTS gestion_rapprochement_bien_proposition_verrou ON gestion_rapprochement_bien_proposition;
CREATE TRIGGER gestion_rapprochement_bien_proposition_verrou BEFORE UPDATE OR DELETE ON gestion_rapprochement_bien_proposition
  FOR EACH ROW EXECUTE FUNCTION gestion_rapprochement_bien_ajout_seul();
DROP TRIGGER IF EXISTS gestion_rapprochement_bien_proposition_no_truncate ON gestion_rapprochement_bien_proposition;
CREATE TRIGGER gestion_rapprochement_bien_proposition_no_truncate BEFORE TRUNCATE ON gestion_rapprochement_bien_proposition
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_rapprochement_bien_ajout_seul();
DROP TRIGGER IF EXISTS gestion_rapprochement_bien_decision_verrou ON gestion_rapprochement_bien_decision;
CREATE TRIGGER gestion_rapprochement_bien_decision_verrou BEFORE UPDATE OR DELETE ON gestion_rapprochement_bien_decision
  FOR EACH ROW EXECUTE FUNCTION gestion_rapprochement_bien_ajout_seul();
DROP TRIGGER IF EXISTS gestion_rapprochement_bien_decision_no_truncate ON gestion_rapprochement_bien_decision;
CREATE TRIGGER gestion_rapprochement_bien_decision_no_truncate BEFORE TRUNCATE ON gestion_rapprochement_bien_decision
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_rapprochement_bien_ajout_seul();
