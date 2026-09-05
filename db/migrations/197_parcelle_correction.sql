-- LOT 101 — CORRECTION MANUELLE d'une parcelle cadastrale mal référencée par Sitadel (ex. dossier 468 : Sitadel dit DK 649, qui
-- N'EXISTE PAS ; la vraie est DI 649 — confusion DK/DI). Sans correction : geom_snapshot NULL → empreinte NULL → schéma non dessiné →
-- calage impossible. Ce lot ajoute un geste HUMAIN « rattacher à la main » : Arno choisit une parcelle candidate (ou saisit la
-- référence), on réécrit la ligne permis_parcelle en origine='saisie' et on RECALCULE l'empreinte.
--
-- Colonne `correction` (jsonb) : TRACE que ce rattachement est une correction MANUELLE et porte de quoi l'ANNULER (référence d'origine
-- remplacée + auteur + date). NULL = pas une correction (rattachement automatique ou parcelle non corrigée). Distingue nettement une
-- parcelle rattachée à la main d'un rapprochement automatique (principe « proposer, jamais deviner »).
-- Forme : {"refOrigine":{"prefixe","section","numero","idu"},"corrigeeLe":"<ts>","corrigeePar":"<auteur>"}.
--
-- Livrée NON APPLIQUÉE ; code RÉSILIENT si absente (42P01/42703 → le geste répond « correction indisponible, mise à jour requise » ;
-- l'auto-rattachement et l'affichage restent inchangés — comportement d'avant).
BEGIN;

ALTER TABLE permis_parcelle
  ADD COLUMN IF NOT EXISTS correction jsonb;

COMMENT ON COLUMN permis_parcelle.correction IS
  'LOT 101 — correction MANUELLE : {refOrigine:{prefixe,section,numero,idu}, corrigeeLe, corrigeePar}. NULL = rattachement automatique / non corrigé. Permet d''annuler (restaurer la référence d''origine) et distingue le geste humain de l''auto.';

COMMIT;
