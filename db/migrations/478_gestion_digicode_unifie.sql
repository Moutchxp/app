-- 478_gestion_digicode_unifie.sql — 🔴🔴 LES DIGICODES UNIFIÉS : UNE SEULE BASE, RATTACHÉE À LA COPROPRIÉTÉ, AVEC LEUR DATE D'APPLICATION (Arno,
-- 16/11/2026, chantier « Digicodes unifiés », lot 1).
--
-- LE BESOIN : une seule base de digicodes, rattachée à la copropriété (adresse + bâtiment), renseignée depuis la fiche Copropriété ET la fiche du
-- bien en Location, par le même chemin serveur. Les syndics changent les codes : un nouveau code ne remplace l'ancien qu'à partir de sa DATE ET
-- HEURE d'application ; avant, l'ancien reste en vigueur ; ensuite il reste dans l'historique. Un bien est relié à SON bâtiment de façon sûre.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL :
--   ① `gestion_digicode` : une ligne par code, JAMAIS effacée ni modifiée (seule l'annulation d'un changement À VENIR est permise) :
--      · l'adresse de la copropriété (`adresse_cle` = la clé d'immeuble de l'adresse, celle de la fiche Copropriété et des biens : `cleImmeuble`) ;
--      · le bâtiment (`batiment_cle`, '' = le code COMMUN de l'adresse ; une cage d'escalier est un bâtiment) ;
--      · la valeur (`digicode` : oui / non ; `code` : 8 caractères au plus, seulement avec oui) ;
--      · `applique_le` : la date et l'heure à partir desquelles ce code est en vigueur ;
--      · `nature` : saisie (première valeur), correction (faute de frappe : même date que la ligne corrigée), changement (date à venir),
--        reprise (valeur d'avant, reprise), arbitrage (valeur choisie parmi des valeurs divergentes) ;
--      · `origine`, le bien d'où l'on a écrit (`lot_id`), l'auteur, la date de saisie.
--      LE CODE EN VIGUEUR à un instant T = la dernière ligne (applique_le, puis id) non annulée dont applique_le <= T.
--   ② `gestion_annuaire_lot.copropriete_batiment_id` : le LIEN SÛR d'un bien vers son bâtiment (registre de la copropriété, 476). Le texte libre
--      « Bâtiment » du bien est gardé tel quel.
-- RIEN N'EST TOUCHÉ dans les anciennes tables (gestion_immeuble 396, gestion_immeuble_batiment 399, colonnes digicode du bien) : elles restent
-- lisibles telles quelles (lecture de repli et rubrique « À arbitrer »). Aucune ligne n'est écrite par cette migration (la reprise est un script,
-- à blanc par défaut).
--
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE. Suppose la 396 et la 476. RECETTE SEULEMENT.
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, les fiches lisent et écrivent les digicodes comme avant (396/399).

CREATE TABLE IF NOT EXISTS gestion_digicode (
  id                  bigserial   PRIMARY KEY,
  adresse_cle         text        NOT NULL CHECK (btrim(adresse_cle) <> ''),
  adresse_libelle     text        NOT NULL CHECK (btrim(adresse_libelle) <> ''),
  batiment_cle        text        NOT NULL DEFAULT '',
  batiment_libelle    text,
  digicode            boolean     NOT NULL,
  code                text        CHECK (code IS NULL OR (btrim(code) <> '' AND char_length(code) <= 8)),
  applique_le         timestamptz NOT NULL,
  nature              text        NOT NULL CHECK (nature IN ('saisie', 'correction', 'changement', 'reprise', 'arbitrage')),
  origine             text        NOT NULL CHECK (origine IN ('fiche_copropriete', 'fiche_bien', 'nouveau_bien', 'reprise')),
  lot_id              bigint      REFERENCES gestion_annuaire_lot(id),
  corrige_id          bigint      REFERENCES gestion_digicode(id),
  annule_le           timestamptz,
  annule_par_libelle  text,
  cree_le             timestamptz NOT NULL DEFAULT now(),
  cree_par            bigint,
  cree_par_libelle    text        NOT NULL CHECK (btrim(cree_par_libelle) <> ''),
  CONSTRAINT gestion_digicode_code_chk CHECK (code IS NULL OR digicode IS TRUE),
  CONSTRAINT gestion_digicode_batiment_chk CHECK ((batiment_cle = '') = (batiment_libelle IS NULL)),
  CONSTRAINT gestion_digicode_annule_chk CHECK ((annule_le IS NULL) = (annule_par_libelle IS NULL)),
  CONSTRAINT gestion_digicode_correction_chk CHECK ((nature = 'correction') = (corrige_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS gestion_digicode_cle_idx ON gestion_digicode (adresse_cle, batiment_cle, applique_le DESC, id DESC);

-- jamais effacée ; une ligne ne change jamais, sauf l'ANNULATION d'un changement encore À VENIR (une seule fois)
CREATE OR REPLACE FUNCTION gestion_digicode_garde() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.annule_le IS NULL AND NEW.annule_le IS NOT NULL AND OLD.applique_le > now()
       AND (to_jsonb(NEW) - 'annule_le' - 'annule_par_libelle') = (to_jsonb(OLD) - 'annule_le' - 'annule_par_libelle') THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'gestion_digicode : % refusé — un digicode et son historique ne s''effacent ni ne se modifient jamais (migration 478)', TG_OP;
END $$;
DROP TRIGGER IF EXISTS gestion_digicode_garde_maj ON gestion_digicode;
CREATE TRIGGER gestion_digicode_garde_maj BEFORE UPDATE OR DELETE ON gestion_digicode FOR EACH ROW EXECUTE FUNCTION gestion_digicode_garde();
DROP TRIGGER IF EXISTS gestion_digicode_no_truncate ON gestion_digicode;
CREATE TRIGGER gestion_digicode_no_truncate BEFORE TRUNCATE ON gestion_digicode FOR EACH STATEMENT EXECUTE FUNCTION gestion_digicode_garde();

ALTER TABLE gestion_annuaire_lot ADD COLUMN IF NOT EXISTS copropriete_batiment_id bigint REFERENCES gestion_copropriete_batiment(id);

COMMENT ON TABLE gestion_digicode IS 'Digicodes unifiés (478) : un code par adresse de copropriété et bâtiment ('''' = commun), en vigueur à partir de applique_le ; ajout seul, annulation d''un changement à venir seulement.';
COMMENT ON COLUMN gestion_digicode.applique_le IS 'Date et heure à partir desquelles ce code est en vigueur (le code en vigueur à T : dernière ligne non annulée avec applique_le <= T).';
COMMENT ON COLUMN gestion_annuaire_lot.copropriete_batiment_id IS 'Le bâtiment (ou la cage) du bien dans le registre de sa copropriété (476) — lien sûr pour le digicode (478). Le texte « Bâtiment » reste tel quel.';
