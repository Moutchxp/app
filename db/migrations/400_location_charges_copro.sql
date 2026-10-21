-- 400_location_charges_copro.sql — LOCATION (Arno, 21/10/2026) : « PAIEMENT DES CHARGES » DE COPROPRIÉTÉ.
--
-- LA RÈGLE (Arno) : sur chaque bien (logement, local, parking), qui règle les charges de copropriété au syndic —
-- « Propriétaire » ou « Agence » ; FACULTATIF (vide = non renseigné), modifiable depuis la fiche du bien, repris dans l'encart
-- du bien et, en gras, dans le mail « Nouvelle location » (information importante pour la comptabilité).
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE (ajout seul) : une colonne FACULTATIVE `charges_copro` sur `gestion_annuaire_lot`,
-- valeurs `proprietaire` / `agence` / NULL. AUCUNE ligne existante n'est modifiée ; rien n'est supprimé.
--
-- IDEMPOTENTE (rejouable). Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction avec son inscription.

ALTER TABLE gestion_annuaire_lot ADD COLUMN IF NOT EXISTS charges_copro text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_annuaire_lot_charges_copro_chk') THEN
    ALTER TABLE gestion_annuaire_lot ADD CONSTRAINT gestion_annuaire_lot_charges_copro_chk
      CHECK (charges_copro IS NULL OR charges_copro IN ('proprietaire', 'agence'));
  END IF;
END $$;

COMMENT ON COLUMN gestion_annuaire_lot.charges_copro IS 'Qui règle les charges de copropriété au syndic : proprietaire / agence ; vide = non renseigné (migration 400).';
