-- 404_gestion_drive_arbre_location_seule.sql — GESTION / LOCATION (Arno, 21/10/2026) : L'ARBRE « BASE DE DONNÉES LOCATION
-- SEULE » DU DRIVE.
--
-- LA RÈGLE (Arno) : à côté de « Base de données locative » (Drive partagé « GESTION LOCATIVE »), un dossier frère « Base de
-- données location seule », de MÊME arborescence (N3 propriétaire › N4 adresse › N5 bien › N6 « 0 En attente » … « 6 Locataires »
-- › N7 BAIL › N8…), sans Actifs / Inactifs. Le dossier d'un bien est dans l'arbre de son STATUT (migration 403) : en gestion →
-- « Base de données locative › Actifs » ; ancienne gestion → « … › Inactifs » ; location seule → « Base de données location
-- seule ». Chaque transition DÉPLACE le dossier N5 entier (jamais copié, jamais supprimé).
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE :
--   · `gestion_drive_noeud.arbre` — l'arbre du nœud : 'locative' (toutes les lignes existantes, par défaut) ou 'location_seule' ;
--   · `branche` (Actifs / Inactifs) devient vide pour l'arbre « location seule », qui n'en a pas — la contrainte le dit ;
--   · le verrou du registre laisse changer, en plus du parent et de la branche, l'ARBRE (un déplacement garde l'identifiant) ;
--   · TABLE NEUVE `gestion_drive_racine` — l'identifiant Drive de la racine d'un arbre créée par l'application (« Base de
--     données location seule »), en ajout seul.
-- AUCUNE ligne existante n'est modifiée (la colonne neuve prend sa valeur par défaut). Rien n'est supprimé.
--
-- IDEMPOTENTE (rejouable). Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction avec son inscription.

ALTER TABLE gestion_drive_noeud
  ADD COLUMN IF NOT EXISTS arbre text NOT NULL DEFAULT 'locative'
    CONSTRAINT gestion_drive_noeud_arbre_chk CHECK (arbre IN ('locative', 'location_seule'));
ALTER TABLE gestion_drive_noeud ALTER COLUMN branche DROP NOT NULL;
ALTER TABLE gestion_drive_noeud DROP CONSTRAINT IF EXISTS gestion_drive_noeud_branche_chk;
ALTER TABLE gestion_drive_noeud ADD CONSTRAINT gestion_drive_noeud_branche_chk
  CHECK ((arbre = 'locative' AND branche IN ('Actifs', 'Inactifs')) OR (arbre = 'location_seule' AND branche IS NULL));
CREATE INDEX IF NOT EXISTS gestion_drive_noeud_arbre ON gestion_drive_noeud (arbre, sorte);

-- Le verrou (migrations 389, 394) : seuls le parent, la branche ET L'ARBRE changent — un déplacement garde l'identifiant.
CREATE OR REPLACE FUNCTION gestion_drive_noeud_verrou() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'gestion_drive_noeud : % refusé (aucun effacement) — migration 389', TG_OP;
  END IF;
  IF (NEW.cle, NEW.sorte, NEW.niveau, NEW.drive_id, NEW.proprietaire_id, NEW.lot_id, NEW.nom_a_la_creation, NEW.cible_drive_id,
      NEW.annee, NEW.bail_entree, NEW.enregistre_le, NEW.enregistre_par, NEW.bail_id)
     IS DISTINCT FROM (OLD.cle, OLD.sorte, OLD.niveau, OLD.drive_id, OLD.proprietaire_id, OLD.lot_id, OLD.nom_a_la_creation,
      OLD.cible_drive_id, OLD.annee, OLD.bail_entree, OLD.enregistre_le, OLD.enregistre_par, OLD.bail_id) THEN
    RAISE EXCEPTION 'gestion_drive_noeud : seuls le parent, la branche et l''arbre changent (un déplacement garde l''identifiant) — migrations 389, 394 et 404';
  END IF;
  RETURN NEW;
END $$;

CREATE TABLE IF NOT EXISTS gestion_drive_racine (
  arbre            text        PRIMARY KEY CHECK (arbre IN ('location_seule')),
  drive_id         text        NOT NULL UNIQUE,
  parent_drive_id  text        NOT NULL,
  nom              text        NOT NULL CHECK (btrim(nom) <> ''),
  enregistre_le    timestamptz NOT NULL DEFAULT now(),
  enregistre_par   text        NOT NULL CHECK (btrim(enregistre_par) <> '')
);
DROP TRIGGER IF EXISTS gestion_drive_racine_ajout_seul ON gestion_drive_racine;
CREATE TRIGGER gestion_drive_racine_ajout_seul BEFORE UPDATE OR DELETE ON gestion_drive_racine
  FOR EACH ROW EXECUTE FUNCTION gestion_ajout_seul_refuser();
DROP TRIGGER IF EXISTS gestion_drive_racine_no_truncate ON gestion_drive_racine;
CREATE TRIGGER gestion_drive_racine_no_truncate BEFORE TRUNCATE ON gestion_drive_racine
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_ajout_seul_refuser();

COMMENT ON COLUMN gestion_drive_noeud.arbre IS 'locative (« Base de données locative », branches Actifs / Inactifs) | location_seule (« Base de données location seule », sans branche) — migration 404.';
COMMENT ON TABLE gestion_drive_racine IS 'La racine d''un arbre du Drive créée par l''application (« Base de données location seule ») : son identifiant, en ajout seul — migration 404.';
