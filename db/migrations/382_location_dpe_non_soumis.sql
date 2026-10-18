-- 382_location_dpe_non_soumis.sql — TUILE LOCATION (Arno, 18/10/2026) : « NON SOUMIS » AU DPE.
--
-- LE BESOIN (Arno) : à la création d'un logement ou d'un local, le DPE devient obligatoire — classe A à G, ou « Non soumis »
-- (bien dispensé de DPE), et la date obligatoire sauf « Non soumis ». La colonne `dpe_classe` (migration 374) n'accepte que
-- A–G : « Non soumis » est une valeur NOUVELLE, qui demande sa colonne.
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE (ajout seul) : une colonne facultative `dpe_non_soumis` sur `gestion_annuaire_lot`
-- (vrai = dispensé ; NULL = rien de dit), avec sa cohérence : un bien « non soumis » n'a ni classe ni date. La contrainte
-- de `dpe_classe` n'est pas touchée. AUCUNE ligne existante n'est modifiée (toutes restent NULL, donc cohérentes).
-- « Entretien à prévoir » non renseigné n'a besoin de rien : `entretien_a_prevoir` (migration 379) est déjà NULL dans ce cas.
--
-- IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction avec son inscription.

ALTER TABLE gestion_annuaire_lot
  ADD COLUMN IF NOT EXISTS dpe_non_soumis boolean
    CONSTRAINT gestion_annuaire_lot_dpe_non_soumis_chk CHECK (dpe_non_soumis IS NOT TRUE OR (dpe_classe IS NULL AND dpe_date IS NULL));

COMMENT ON COLUMN gestion_annuaire_lot.dpe_non_soumis IS 'Bien dispensé de DPE (« Non soumis », tuile Location) : vrai = ni classe ni date ; NULL = non renseigné — migration 382.';
