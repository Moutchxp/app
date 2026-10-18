-- 379_location_entretien_annexe_mandat.sql — TUILE LOCATION (Arno, 18/10/2026) : ENTRETIEN À PRÉVOIR, ANNOTATION ET
-- DÉTACHEMENT D'UNE ANNEXE, MANDAT DE TRANSACTION LOCATIVE.
--
-- LE BESOIN (Arno) :
--   · « Entretien à prévoir » Oui / Non ; si Oui : Chaudière, Ramonage (cases) et des « Autre entretien » libres, chacun
--     avec une date anniversaire facultative. Repasser à Non vide le tout. Dates exploitables pour de futures relances.
--   · Une « Annotation » libre sur chaque annexe.
--   · « Détacher » une annexe : louable séparément, elle sort de l'ensemble loué avec le logement mais garde À VIE son lien
--     de parenté (toujours affichée sous lui, étiquette « Détachée ») ; « Rattacher » la remet dans l'ensemble.
--   · « Propriétaire(s) en gestion ? » Non ⇒ un « N° de mandat de transaction locative ».
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE (ajout seul) :
--   · `gestion_annuaire_lot` : `annotation`, `entretien_a_prevoir`, `annexe_detachee_le` / `annexe_detachee_par_libelle`.
--     🔴 LE LIEN PARENT (`gestion_lot_annexe`, en ajout seul) N'EST PAS TOUCHÉ : le détachement est une MARQUE sur l'annexe,
--     le lien reste tel quel — aucune perte de parenté, jamais.
--   · `gestion_annuaire_proprietaire` : `numero_mandat_transaction`.
--   · une table neuve `gestion_lot_entretien` (un entretien = une ligne, sa date anniversaire en colonne date + index pour
--     la future relance). Rien n'y est jamais effacé : « Non » ou une ligne supprimée écrit `retire_le`.
-- AUCUNE ligne existante n'est modifiée. Lues et écrites QUE par la tuile Location (et la section « Location » de la fiche
-- commune).
--
-- IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction avec son inscription.

ALTER TABLE gestion_annuaire_lot
  ADD COLUMN IF NOT EXISTS annotation text,
  ADD COLUMN IF NOT EXISTS entretien_a_prevoir boolean,
  ADD COLUMN IF NOT EXISTS annexe_detachee_le timestamptz,
  ADD COLUMN IF NOT EXISTS annexe_detachee_par_libelle text;

ALTER TABLE gestion_annuaire_proprietaire
  ADD COLUMN IF NOT EXISTS numero_mandat_transaction text;

CREATE TABLE IF NOT EXISTS gestion_lot_entretien (
  id bigserial PRIMARY KEY,
  lot_id bigint NOT NULL REFERENCES gestion_annuaire_lot(id),
  sorte text NOT NULL CONSTRAINT gestion_lot_entretien_sorte_chk CHECK (sorte IN ('chaudiere', 'ramonage', 'autre')),
  nom text CONSTRAINT gestion_lot_entretien_nom_chk CHECK (sorte <> 'autre' OR btrim(coalesce(nom, '')) <> ''),
  date_anniversaire date,
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par_libelle text NOT NULL,
  retire_le timestamptz,
  retire_par_libelle text
);

CREATE INDEX IF NOT EXISTS gestion_lot_entretien_par_lot ON gestion_lot_entretien (lot_id) WHERE retire_le IS NULL;
CREATE INDEX IF NOT EXISTS gestion_lot_entretien_echeance ON gestion_lot_entretien (date_anniversaire) WHERE retire_le IS NULL AND date_anniversaire IS NOT NULL;

COMMENT ON COLUMN gestion_annuaire_lot.annexe_detachee_le IS 'Annexe louable séparément (sortie de l''ensemble loué) ; son lien parent reste dans gestion_lot_annexe (migration 379).';
COMMENT ON COLUMN gestion_annuaire_proprietaire.numero_mandat_transaction IS 'N° de mandat de transaction locative (propriétaire non en gestion), texte libre (migration 379).';
COMMENT ON TABLE gestion_lot_entretien IS 'Entretiens à prévoir d''un bien (chaudière, ramonage, autres) et leur date anniversaire ; jamais effacés (retire_le) — migration 379.';
