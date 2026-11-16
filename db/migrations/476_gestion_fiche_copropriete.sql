-- 476_gestion_fiche_copropriete.sql — LA FICHE COPROPRIÉTÉ, SÉPARÉE DU SYNDIC : LE SOCLE (Arno, 16/11/2026, chantier « Fiche Copropriété », lot 1).
--
-- LE BESOIN : la COPROPRIÉTÉ (le syndicat des copropriétaires, ses adresses, ses digicodes, ses AG, ses habitants et gardiens) devient une fiche à
-- part entière, distincte du SYNDIC (la société payée pour la gérer). Les données de la copropriété sont DÉJÀ rangées sur elle (324, 333, 335,
-- 336, 475) et le digicode sur l'immeuble de chaque adresse (396, 399) : cette migration n'en déplace AUCUNE.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL :
--   · sur la copropriété : un NOM facultatif (« Résidence Les Tilleuls » ; vide : son libellé d'aujourd'hui), « HORS COPROPRIÉTÉ » (l'immeuble
--     entier n'est pas en copropriété : la fiche garde adresses, digicodes, gardien et habitants, sans syndic ni AG), et la NOMENCLATURE des
--     bâtiments (« lettres » ou « chiffres », fixée par le premier bâtiment créé en lettre ou en chiffre ; un intitulé libre ne la fixe pas) ;
--   · le registre des BÂTIMENTS de la copropriété, commun à toutes ses adresses (le menu des bâtiments) ; les codes restent par adresse
--     (`gestion_immeuble_batiment`, 399). Les bâtiments déjà connus (399, champ « Bâtiment » des biens) sont relus tels quels par l'application :
--     rien à reprendre ;
--   · le statut « Copropriétaire » parmi les contacts de l'immeuble (gardien, copropriétaire, conseil syndical, personnalisé).
-- Rien n'est supprimé, renommé ni déplacé ; le digicode actuel de chaque immeuble EST déjà le digicode commun de son adresse.
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE. Suppose 324, 333, 335.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, la fiche copropriété se lit sans nom, ni « hors copropriété », ni registre de bâtiments,
-- et le statut « Copropriétaire » est refusé avec un message.

ALTER TABLE gestion_copropriete ADD COLUMN IF NOT EXISTS nom text NULL;
ALTER TABLE gestion_copropriete ADD COLUMN IF NOT EXISTS hors_copropriete boolean NOT NULL DEFAULT false;
ALTER TABLE gestion_copropriete ADD COLUMN IF NOT EXISTS nomenclature_batiments text NULL;
ALTER TABLE gestion_copropriete ADD COLUMN IF NOT EXISTS maj_le timestamptz NULL;
ALTER TABLE gestion_copropriete ADD COLUMN IF NOT EXISTS maj_par_libelle text NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_copropriete_nom_chk') THEN
    ALTER TABLE gestion_copropriete ADD CONSTRAINT gestion_copropriete_nom_chk CHECK (nom IS NULL OR btrim(nom) <> '');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_copropriete_nomenclature_chk') THEN
    ALTER TABLE gestion_copropriete ADD CONSTRAINT gestion_copropriete_nomenclature_chk CHECK (nomenclature_batiments IS NULL OR nomenclature_batiments IN ('lettres', 'chiffres'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS gestion_copropriete_batiment (
  id                bigserial PRIMARY KEY,
  copropriete_id    bigint NOT NULL REFERENCES gestion_copropriete (id),
  batiment_cle      text NOT NULL CHECK (btrim(batiment_cle) <> ''),
  batiment_libelle  text NOT NULL CHECK (btrim(batiment_libelle) <> ''),
  sorte             text NOT NULL CHECK (sorte IN ('lettre', 'chiffre', 'libre')),
  cree_le           timestamptz NOT NULL DEFAULT now(),
  cree_par          bigint NULL,
  cree_par_libelle  text NOT NULL CHECK (btrim(cree_par_libelle) <> ''),
  CONSTRAINT gestion_copropriete_batiment_unique UNIQUE (copropriete_id, batiment_cle)
);
CREATE OR REPLACE FUNCTION gestion_copropriete_batiment_refuser() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% : % refusé — un bâtiment de copropriété ne s''efface jamais (migration 476)', TG_TABLE_NAME, TG_OP;
END $$;
DROP TRIGGER IF EXISTS gestion_copropriete_batiment_no_delete ON gestion_copropriete_batiment;
CREATE TRIGGER gestion_copropriete_batiment_no_delete BEFORE DELETE ON gestion_copropriete_batiment
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_copropriete_batiment_refuser();
DROP TRIGGER IF EXISTS gestion_copropriete_batiment_no_truncate ON gestion_copropriete_batiment;
CREATE TRIGGER gestion_copropriete_batiment_no_truncate BEFORE TRUNCATE ON gestion_copropriete_batiment
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_copropriete_batiment_refuser();

-- le statut « Copropriétaire » (les catégories existantes restent toutes valables)
ALTER TABLE gestion_copropriete_contact DROP CONSTRAINT IF EXISTS gestion_copropriete_contact_categorie_check;
ALTER TABLE gestion_copropriete_contact ADD CONSTRAINT gestion_copropriete_contact_categorie_check
  CHECK (categorie IN ('gardien', 'coproprietaire', 'conseil_syndical', 'personnalise'));

COMMENT ON COLUMN gestion_copropriete.nom IS 'Nom facultatif de la copropriété (« Résidence Les Tilleuls ») ; vide : son libellé — migration 476.';
COMMENT ON COLUMN gestion_copropriete.hors_copropriete IS 'L''immeuble entier n''est PAS en copropriété : fiche sans syndic ni AG (adresses, digicodes, gardien, habitants) — migration 476.';
COMMENT ON COLUMN gestion_copropriete.nomenclature_batiments IS 'Nomenclature des bâtiments de toute la copropriété : lettres ou chiffres, fixée par le premier bâtiment créé (un intitulé libre ne la fixe pas) — migration 476.';
COMMENT ON TABLE gestion_copropriete_batiment IS 'Registre des bâtiments d''une copropriété, commun à toutes ses adresses (menu des bâtiments) ; les codes restent par adresse (399) ; jamais effacé — migration 476.';
