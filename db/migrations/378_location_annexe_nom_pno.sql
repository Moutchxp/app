-- 378_location_annexe_nom_pno.sql — TUILE LOCATION (Arno, 18/10/2026) : NOM D'UNE ANNEXE « AUTRE », ASSURANCE PNO.
--
-- LE BESOIN (Arno) :
--   · « Annexe “Autre” : un champ “Nom de l'annexe” (Cellier, Grenier, Local vélo), obligatoire pour une annexe Autre,
--     affiché ensuite comme titre de l'annexe dans l'arbre et dans la fiche commune. »
--   · « Assurance PNO : Oui / Non, et si Oui une “Date anniversaire”. Enregistrée sur le bien. Repasser à Non vide la date.
--     Pas de relance automatique pour l'instant (Outils de suivi) : la date doit être exploitable. »
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE (ajout seul) : trois colonnes FACULTATIVES sur `gestion_annuaire_lot`, une contrainte qui
-- interdit une date anniversaire sans assurance PNO, et un index partiel sur cette date (la future relance la lira par
-- échéance). AUCUNE ligne existante n'est modifiée. Lues et écrites QUE par la tuile Location (et la section « Location »
-- de la fiche commune).
--
-- IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction avec son inscription.

ALTER TABLE gestion_annuaire_lot
  ADD COLUMN IF NOT EXISTS nom_annexe text,
  ADD COLUMN IF NOT EXISTS assurance_pno boolean,
  ADD COLUMN IF NOT EXISTS pno_date_anniversaire date
    CONSTRAINT gestion_annuaire_lot_pno_date_chk CHECK (pno_date_anniversaire IS NULL OR assurance_pno IS TRUE);

CREATE INDEX IF NOT EXISTS gestion_annuaire_lot_pno_echeance ON gestion_annuaire_lot (pno_date_anniversaire) WHERE assurance_pno IS TRUE;

COMMENT ON COLUMN gestion_annuaire_lot.nom_annexe IS 'Nom d''une annexe « Autre » (Cellier, Grenier, Local vélo), titre de l''annexe (tuile Location, migration 378).';
COMMENT ON COLUMN gestion_annuaire_lot.assurance_pno IS 'Assurance propriétaire non occupant : oui / non / non renseigné (tuile Location, migration 378).';
COMMENT ON COLUMN gestion_annuaire_lot.pno_date_anniversaire IS 'Date anniversaire du contrat PNO (seulement si assurance_pno) ; lue par la future relance (migration 378).';
