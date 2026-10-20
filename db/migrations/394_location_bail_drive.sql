-- 394_location_bail_drive.sql — LOCATION (Arno, 20/10/2026) : LA BRANCHE « BAIL » DU DRIVE, RATTACHÉE AU BAIL.
--
-- LE BESOIN : à l'enregistrement d'un nouveau locataire, la branche N7 → N10 de son bail est créée sur le Drive
-- (« BAIL MARTIN » › « 1 Papiers d'identité » … « 6 Entretien » › « Assurance habitation » / « Chaudière » › année). Chaque
-- dossier est enregistré dans `gestion_drive_noeud` (migration 389), comme ceux de l'arborescence ; cette migration y ajoute
-- `bail_id` (FK vers `gestion_bail`, migration 393) pour rattacher la branche AU BAIL — c'est par lui que la fiche retrouve
-- son dossier, qu'on renomme le N7 quand un occupant rejoint le bail, et que la création rejouée ne double rien.
--   · colonne facultative : les dossiers de l'arborescence existante (baux reconnus par « lot + date ») la laissent vide ;
--   · le verrou de la 389 (seuls le parent et la branche changent) couvre aussi `bail_id` : une ligne ne change jamais de bail.
-- AUCUNE ligne supprimée, aucune ligne modifiée.
--
-- TRANSACTIONNELLE ET REJOUABLE : la mise à jour l'enveloppe dans UNE transaction ; chaque instruction est idempotente.
-- Prérequis : 389 (gestion_drive_noeud) et 393 (gestion_bail).

ALTER TABLE gestion_drive_noeud ADD COLUMN IF NOT EXISTS bail_id bigint REFERENCES gestion_bail(id);
CREATE INDEX IF NOT EXISTS gestion_drive_noeud_bail ON gestion_drive_noeud (bail_id) WHERE bail_id IS NOT NULL;

-- Le verrou de la 389, avec `bail_id` parmi les colonnes qui ne changent jamais.
CREATE OR REPLACE FUNCTION gestion_drive_noeud_verrou() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'gestion_drive_noeud : % refusé (aucun effacement) — migration 389', TG_OP;
  END IF;
  IF (NEW.cle, NEW.sorte, NEW.niveau, NEW.drive_id, NEW.proprietaire_id, NEW.lot_id, NEW.nom_a_la_creation, NEW.cible_drive_id,
      NEW.annee, NEW.bail_entree, NEW.enregistre_le, NEW.enregistre_par, NEW.bail_id)
     IS DISTINCT FROM (OLD.cle, OLD.sorte, OLD.niveau, OLD.drive_id, OLD.proprietaire_id, OLD.lot_id, OLD.nom_a_la_creation,
      OLD.cible_drive_id, OLD.annee, OLD.bail_entree, OLD.enregistre_le, OLD.enregistre_par, OLD.bail_id) THEN
    RAISE EXCEPTION 'gestion_drive_noeud : seuls le parent et la branche changent (un déplacement garde l''identifiant) — migrations 389 et 394';
  END IF;
  RETURN NEW;
END $$;

COMMENT ON COLUMN gestion_drive_noeud.bail_id IS 'Le bail (gestion_bail) dont ce dossier est la branche N7 → N10, créée par « Nouveau locataire » — migration 394. Vide pour l''arborescence d''origine.';
