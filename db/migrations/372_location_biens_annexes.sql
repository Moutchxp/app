-- 372_location_biens_annexes.sql — TUILE LOCATION (correction d'Arno du 17/10/2026) : N° DE MANDAT, FICHE DU BIEN
-- ENRICHIE, ANNEXES EN ARBRE.
--
-- LE BESOIN (Arno) : « Fiche du bien : adresse, étage, surface Carrez, surface extérieure, n° de porte, n° de lot de
-- copropriété ; annexes (cave, parking) EN ARBRE sous leur logement, avec étage, n° de lot, n° de porte ou de place. Une
-- annexe garde toujours son lien avec le logement d'origine. » ; « Champ “N° de mandat de gestion” (texte libre,
-- facultatif) sur le propriétaire. » Seules les DONNÉES sont communes avec la Gestion ; les écrans sont dans la Location.
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE (ajout seul) :
--   · `gestion_annuaire_proprietaire.numero_mandat_gestion` — texte libre, facultatif, saisi à la main, jamais généré ;
--   · sur `gestion_annuaire_lot`, des colonnes facultatives : `categorie` (logement | cave | parking | box | local |
--     autre ; vide = déduite de la nature WIPPIMMO à l'affichage), `etage`, `porte` (n° de porte ou de place),
--     `num_lot_copro`, `surface_carrez_m2`, `surface_exterieure_m2`. L'import WIPPIMMO ne les connaît pas et ne les
--     écrit jamais ;
--   · TABLE NEUVE `gestion_lot_annexe` — le lien d'une annexe (cave, parking…) avec son logement. La base garantit qu'il
--     n'est JAMAIS perdu : ni modification, ni suppression, ni vidage (déclencheurs) ; une seule attache par annexe ; pas
--     d'annexe d'annexe ; une annexe n'est pas son propre logement.
--
-- AUCUNE ligne existante n'est lue ni modifiée.
--
-- IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction avec son inscription.

ALTER TABLE gestion_annuaire_proprietaire ADD COLUMN IF NOT EXISTS numero_mandat_gestion text;

ALTER TABLE gestion_annuaire_lot
  ADD COLUMN IF NOT EXISTS categorie text
    CONSTRAINT gestion_annuaire_lot_categorie_chk
    CHECK (categorie IS NULL OR categorie IN ('logement', 'cave', 'parking', 'box', 'local', 'autre')),
  ADD COLUMN IF NOT EXISTS etage text,
  ADD COLUMN IF NOT EXISTS porte text,
  ADD COLUMN IF NOT EXISTS num_lot_copro text,
  ADD COLUMN IF NOT EXISTS surface_carrez_m2 numeric
    CONSTRAINT gestion_annuaire_lot_carrez_chk CHECK (surface_carrez_m2 IS NULL OR surface_carrez_m2 >= 0),
  ADD COLUMN IF NOT EXISTS surface_exterieure_m2 numeric
    CONSTRAINT gestion_annuaire_lot_exterieure_chk CHECK (surface_exterieure_m2 IS NULL OR surface_exterieure_m2 >= 0);

CREATE TABLE IF NOT EXISTS gestion_lot_annexe (
  id                bigserial   PRIMARY KEY,
  annexe_id         bigint      NOT NULL REFERENCES gestion_annuaire_lot(id),
  parent_id         bigint      NOT NULL REFERENCES gestion_annuaire_lot(id),
  pose_le           timestamptz NOT NULL DEFAULT now(),
  pose_par_libelle  text        NOT NULL CHECK (btrim(pose_par_libelle) <> ''),
  CONSTRAINT gestion_lot_annexe_soi_chk CHECK (annexe_id <> parent_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS gestion_lot_annexe_unique_uq ON gestion_lot_annexe (annexe_id);
CREATE INDEX IF NOT EXISTS gestion_lot_annexe_parent_idx ON gestion_lot_annexe (parent_id);

-- Pas d'annexe d'annexe : le logement d'une annexe n'est pas lui-même une annexe, et une annexe n'a pas d'annexes.
CREATE OR REPLACE FUNCTION gestion_lot_annexe_profondeur() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM gestion_lot_annexe WHERE annexe_id = NEW.parent_id) THEN
    RAISE EXCEPTION 'gestion_lot_annexe : le bien % est lui-même une annexe — pas d''annexe d''annexe', NEW.parent_id;
  END IF;
  IF EXISTS (SELECT 1 FROM gestion_lot_annexe WHERE parent_id = NEW.annexe_id) THEN
    RAISE EXCEPTION 'gestion_lot_annexe : le bien % a déjà des annexes — il ne peut pas devenir une annexe', NEW.annexe_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS gestion_lot_annexe_profondeur ON gestion_lot_annexe;
CREATE TRIGGER gestion_lot_annexe_profondeur BEFORE INSERT ON gestion_lot_annexe
  FOR EACH ROW EXECUTE FUNCTION gestion_lot_annexe_profondeur();

-- Le lien n'est jamais perdu : la fonction de la migration 370 refuse toute modification et tout effacement.
DROP TRIGGER IF EXISTS gestion_lot_annexe_ajout_seul ON gestion_lot_annexe;
CREATE TRIGGER gestion_lot_annexe_ajout_seul BEFORE UPDATE OR DELETE ON gestion_lot_annexe
  FOR EACH ROW EXECUTE FUNCTION gestion_ajout_seul_refuser();
DROP TRIGGER IF EXISTS gestion_lot_annexe_no_truncate ON gestion_lot_annexe;
CREATE TRIGGER gestion_lot_annexe_no_truncate BEFORE TRUNCATE ON gestion_lot_annexe
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_ajout_seul_refuser();

COMMENT ON COLUMN gestion_annuaire_proprietaire.numero_mandat_gestion IS 'N° de mandat de gestion : texte libre, facultatif, saisi à la main — jamais généré ni numéroté par l''outil (migration 372).';
COMMENT ON COLUMN gestion_annuaire_lot.categorie IS 'logement | cave | parking | box | local | autre ; vide = déduite de la nature WIPPIMMO (migration 372).';
COMMENT ON COLUMN gestion_annuaire_lot.porte IS 'N° de porte, ou n° de place pour un parking (migration 372).';
COMMENT ON TABLE gestion_lot_annexe IS 'Lien d''une annexe (cave, parking…) avec son logement d''origine. Jamais modifié ni supprimé (migration 372).';
