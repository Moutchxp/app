-- 389_gestion_drive_noeud.sql — LES IDENTIFIANTS DE L'ARBORESCENCE DRIVE VALIDÉE (N3 → N10) (Arno, 19/10/2026).
--
-- LE BESOIN : l'arborescence « Base de données locative › Actifs/Inactifs › propriétaire › adresse › bien › rubriques ›
-- baux › pièces › années » est construite par les scripts I et J. L'application doit garder l'IDENTIFIANT de chaque dossier
-- créé (N3, N4, N5, N6, N7 bail, dossiers annuels…) : on retrouve un dossier par sa clé métier, JAMAIS par son nom ; un
-- renommage reste un renommage, jamais une recréation.
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE (ajout seul) : une table neuve, `gestion_drive_noeud` — une ligne par dossier (ou
-- raccourci) de l'arborescence, avec sa clé métier (`p:<fiche>:A`, `b:<lot>`, `l:<lot>:<entrée>`…), son identifiant Drive,
-- son parent, sa branche, la fiche et le lot qu'il sert. AUCUNE donnée écrite ici : l'enregistrement est l'étape K, lancée
-- par Arno, en une transaction (qui repointe aussi `drive_dossier_id` des fiches vers leur N3 et des lots vers leur N5).
--   · Verrou EN BASE : ni DELETE, ni TRUNCATE. Un UPDATE ne peut changer que le parent et la branche (un dossier déplacé
--     garde son identifiant) : la clé, l'identifiant Drive, la sorte et la fiche ne changent jamais.
--
-- IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction avec son inscription.

CREATE TABLE IF NOT EXISTS gestion_drive_noeud (
  id bigserial PRIMARY KEY,
  -- La clé métier : c'est elle qu'on relit (jamais le nom). Posée aussi en étiquette `svav_arbo` sur le dossier.
  cle text NOT NULL CONSTRAINT gestion_drive_noeud_cle_uq UNIQUE,
  sorte text NOT NULL CONSTRAINT gestion_drive_noeud_sorte_chk CHECK (sorte IN ('proprietaire', 'adresse', 'bien', 'rubrique',
    'sous_rubrique', 'annee', 'bail', 'piece_bail', 'sous_piece_bail', 'classement_origine', 'raccourci')),
  niveau smallint NOT NULL CONSTRAINT gestion_drive_noeud_niveau_chk CHECK (niveau BETWEEN 3 AND 10),
  drive_id text NOT NULL CONSTRAINT gestion_drive_noeud_drive_id_uq UNIQUE,
  parent_drive_id text NOT NULL,
  branche text NOT NULL CONSTRAINT gestion_drive_noeud_branche_chk CHECK (branche IN ('Actifs', 'Inactifs')),
  proprietaire_id bigint NOT NULL REFERENCES gestion_annuaire_proprietaire(id),
  -- Le lot qui présente le bien (N5 et tout ce qui est dessous) ; vide pour N3, N4 et « Classement d'origine ».
  lot_id bigint REFERENCES gestion_annuaire_lot(id),
  -- Le nom donné à la création : le Drive peut être renommé ensuite, la ligne reste la même.
  nom_a_la_creation text NOT NULL,
  -- Raccourci (rubriques d'un lot orphelin) : le dossier visé.
  cible_drive_id text,
  annee smallint,
  bail_entree date,
  enregistre_le timestamptz NOT NULL DEFAULT now(),
  enregistre_par text NOT NULL,
  CONSTRAINT gestion_drive_noeud_raccourci_chk CHECK ((sorte = 'raccourci') = (cible_drive_id IS NOT NULL)),
  CONSTRAINT gestion_drive_noeud_annee_chk CHECK ((sorte = 'annee') = (annee IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS gestion_drive_noeud_proprietaire ON gestion_drive_noeud (proprietaire_id);
CREATE INDEX IF NOT EXISTS gestion_drive_noeud_lot ON gestion_drive_noeud (lot_id) WHERE lot_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS gestion_drive_noeud_parent ON gestion_drive_noeud (parent_drive_id);

-- Le verrou : jamais d'effacement ; un UPDATE ne déplace (parent, branche), il ne réécrit rien d'autre.
CREATE OR REPLACE FUNCTION gestion_drive_noeud_verrou() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'gestion_drive_noeud : % refusé (aucun effacement) — migration 389', TG_OP;
  END IF;
  IF (NEW.cle, NEW.sorte, NEW.niveau, NEW.drive_id, NEW.proprietaire_id, NEW.lot_id, NEW.nom_a_la_creation, NEW.cible_drive_id,
      NEW.annee, NEW.bail_entree, NEW.enregistre_le, NEW.enregistre_par)
     IS DISTINCT FROM (OLD.cle, OLD.sorte, OLD.niveau, OLD.drive_id, OLD.proprietaire_id, OLD.lot_id, OLD.nom_a_la_creation,
      OLD.cible_drive_id, OLD.annee, OLD.bail_entree, OLD.enregistre_le, OLD.enregistre_par) THEN
    RAISE EXCEPTION 'gestion_drive_noeud : seuls le parent et la branche changent (un déplacement garde l''identifiant) — migration 389';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS gestion_drive_noeud_verrou ON gestion_drive_noeud;
CREATE TRIGGER gestion_drive_noeud_verrou BEFORE UPDATE OR DELETE ON gestion_drive_noeud
  FOR EACH ROW EXECUTE FUNCTION gestion_drive_noeud_verrou();
DROP TRIGGER IF EXISTS gestion_drive_noeud_no_truncate ON gestion_drive_noeud;
CREATE TRIGGER gestion_drive_noeud_no_truncate BEFORE TRUNCATE ON gestion_drive_noeud
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_drive_noeud_verrou();
