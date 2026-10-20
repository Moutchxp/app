-- 396_gestion_immeuble_digicode.sql — LOCATION / GESTION (Arno, 21/10/2026) : LE DIGICODE PORTÉ PAR L'IMMEUBLE.
--
-- LA RÈGLE (Arno) : le digicode appartient à l'IMMEUBLE, identifié par son ADRESSE POSTALE (numéro, voie, code postal,
-- commune, normalisés : casse, accents, espaces, abréviations bd / av / r) — jamais au syndic : changer de syndic, ou ne plus
-- en avoir, ne change rien au digicode. UN SEUL digicode par immeuble, enregistré sur l'immeuble ; les fiches de biens ne le
-- copient pas, elles affichent et modifient celui de leur immeuble. Chaque changement est journalisé (ancien code, nouveau
-- code, qui, quand, depuis quelle fiche).
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE (ajouts) :
--   ① TABLE NEUVE `gestion_immeuble` : un immeuble par clé d'adresse normalisée (`cle_adresse`, calculée par l'application —
--     `cleAdresse` de `mailNouvelleLocation.ts`, la même règle partout), avec l'adresse lisible et le digicode (Oui / Non et
--     le code). Indépendante du syndic et des copropriétés. Créée à la première saisie d'un digicode. Ni DELETE ni TRUNCATE ;
--   ② TABLE NEUVE `gestion_immeuble_digicode_journal` : le journal des changements, en ajout seul ;
--   ③ les colonnes `digicode` / `digicode_code` de `gestion_annuaire_lot` restent EN PLACE (aucune valeur touchée), signalées
--     OBSOLÈTES : elles ne sont plus écrites ; leur valeur reste lisible pour un bien dont l'immeuble n'a pas encore de digicode
--     (reprise « à arbitrer »). La reprise est un script séparé (`app/scripts/reprendre-digicodes-immeubles.ts`).
-- AUCUNE ligne n'est supprimée ni modifiée.
--
-- IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction avec son inscription.

CREATE TABLE IF NOT EXISTS gestion_immeuble (
  id                   bigserial   PRIMARY KEY,
  cle_adresse          text        NOT NULL UNIQUE CHECK (btrim(cle_adresse) <> ''),
  voie                 text        NOT NULL CHECK (btrim(voie) <> ''),
  code_postal          text,
  commune              text,
  -- Le digicode de l'immeuble : Oui / Non / inconnu (NULL), et le code (8 caractères au plus, seulement avec Oui).
  digicode             boolean,
  digicode_code        text        CHECK (digicode_code IS NULL OR char_length(digicode_code) <= 8),
  cree_le              timestamptz NOT NULL DEFAULT now(),
  cree_par             bigint,
  cree_par_libelle     text        NOT NULL CHECK (btrim(cree_par_libelle) <> ''),
  modifie_le           timestamptz,
  modifie_par_libelle  text,
  CONSTRAINT gestion_immeuble_code_chk CHECK (digicode_code IS NULL OR digicode IS TRUE)
);

CREATE TABLE IF NOT EXISTS gestion_immeuble_digicode_journal (
  id               bigserial   PRIMARY KEY,
  immeuble_id      bigint      NOT NULL REFERENCES gestion_immeuble(id),
  le               timestamptz NOT NULL DEFAULT now(),
  avant_digicode   boolean,
  avant_code       text,
  apres_digicode   boolean,
  apres_code       text,
  -- D'où vient le geste : « fiche_syndic » (fiche immeuble / syndic), « fiche_bien », « nouveau_bien », « reprise ».
  depuis           text        NOT NULL CHECK (depuis IN ('fiche_syndic', 'fiche_bien', 'nouveau_bien', 'reprise')),
  lot_id           bigint      REFERENCES gestion_annuaire_lot(id),
  auteur_id        bigint,
  auteur_libelle   text        NOT NULL CHECK (btrim(auteur_libelle) <> '')
);
CREATE INDEX IF NOT EXISTS gestion_immeuble_digicode_journal_immeuble_idx ON gestion_immeuble_digicode_journal (immeuble_id, le DESC);

CREATE OR REPLACE FUNCTION gestion_immeuble_refuser() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% : % refusé — un immeuble et son journal ne s''effacent jamais (migration 396)', TG_TABLE_NAME, TG_OP;
END $$;
DROP TRIGGER IF EXISTS gestion_immeuble_no_delete ON gestion_immeuble;
CREATE TRIGGER gestion_immeuble_no_delete BEFORE DELETE ON gestion_immeuble FOR EACH STATEMENT EXECUTE FUNCTION gestion_immeuble_refuser();
DROP TRIGGER IF EXISTS gestion_immeuble_no_truncate ON gestion_immeuble;
CREATE TRIGGER gestion_immeuble_no_truncate BEFORE TRUNCATE ON gestion_immeuble FOR EACH STATEMENT EXECUTE FUNCTION gestion_immeuble_refuser();
DROP TRIGGER IF EXISTS gestion_immeuble_digicode_journal_ajout_seul ON gestion_immeuble_digicode_journal;
CREATE TRIGGER gestion_immeuble_digicode_journal_ajout_seul BEFORE UPDATE OR DELETE ON gestion_immeuble_digicode_journal
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_immeuble_refuser();
DROP TRIGGER IF EXISTS gestion_immeuble_digicode_journal_no_truncate ON gestion_immeuble_digicode_journal;
CREATE TRIGGER gestion_immeuble_digicode_journal_no_truncate BEFORE TRUNCATE ON gestion_immeuble_digicode_journal
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_immeuble_refuser();

COMMENT ON TABLE gestion_immeuble IS 'Immeuble identifié par son adresse postale normalisée (cle_adresse) : porte le digicode, commun à tous les biens de l''adresse, indépendant du syndic — migration 396.';
COMMENT ON TABLE gestion_immeuble_digicode_journal IS 'Journal des changements de digicode d''un immeuble (avant, après, qui, quand, depuis quelle fiche), ajout seul — migration 396.';
COMMENT ON COLUMN gestion_annuaire_lot.digicode IS 'OBSOLÈTE (migration 396) : le digicode est porté par l''immeuble (gestion_immeuble). Gardée en place, plus écrite ; lue seulement tant que l''immeuble n''en a pas.';
COMMENT ON COLUMN gestion_annuaire_lot.digicode_code IS 'OBSOLÈTE (migration 396) : le code du digicode est porté par l''immeuble (gestion_immeuble). Gardé en place, plus écrit ; lu seulement tant que l''immeuble n''en a pas (reprise « à arbitrer »).';
