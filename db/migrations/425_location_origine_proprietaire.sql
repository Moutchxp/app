-- 425_location_origine_proprietaire.sql — LOCATION (Arno, 25/10/2026) : L'ORIGINE DU CONTACT PORTÉE PAR LE PROPRIÉTAIRE.
--
-- DÉCISION D'ARNO : « L'origine du contact (apporteur interne/externe, collègue, ou autre origine) est saisie à la création du propriétaire,
-- puis reprise automatiquement pour chaque bien rattaché ensuite à ce propriétaire et pour chaque nouvelle location de ces biens. »
-- Elle reste modifiable sur la location (la dernière validation humaine l'emporte, sans toucher le propriétaire) ; modifier l'origine
-- d'un propriétaire ne change PAS les locations déjà enregistrées (report proposé, décoché par défaut, aux seules « à renseigner »).
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL (aucune ligne existante n'est modifiée ni supprimée) — sur `gestion_annuaire_proprietaire` :
--   · `origine_contact` : la même liste que la location, sans « relocation » ni « proprietaire_deja_client » (propres à une location),
--     plus « inconnue » (« Origine inconnue — à compléter » : satisfait l'obligation, n'est pas héritée) ; NULL : à renseigner (import) ;
--   · `origine_contact_precision` (« Personnalisé », 80 caractères au plus), `origine_apporteur_id` (l'annuaire des apporteurs),
--     `origine_collegue_id` / `origine_collegue_libelle` (« Collègue directement ») ;
--   · `origine_modifiee_le`, `origine_modifiee_par_libelle` : la dernière saisie (le détail entre au journal, compte et session).
-- IDEMPOTENTE (rejouable). Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION (`origineProprietaireDisponible`) : sans elle, rien n'est demandé ni écrit, et les écrans
-- disent que la mise à jour de la base est à appliquer.

ALTER TABLE gestion_annuaire_proprietaire ADD COLUMN IF NOT EXISTS origine_contact text;
ALTER TABLE gestion_annuaire_proprietaire ADD COLUMN IF NOT EXISTS origine_contact_precision text;
ALTER TABLE gestion_annuaire_proprietaire ADD COLUMN IF NOT EXISTS origine_apporteur_id bigint;
ALTER TABLE gestion_annuaire_proprietaire ADD COLUMN IF NOT EXISTS origine_collegue_id bigint;
ALTER TABLE gestion_annuaire_proprietaire ADD COLUMN IF NOT EXISTS origine_collegue_libelle text;
ALTER TABLE gestion_annuaire_proprietaire ADD COLUMN IF NOT EXISTS origine_modifiee_le timestamptz;
ALTER TABLE gestion_annuaire_proprietaire ADD COLUMN IF NOT EXISTS origine_modifiee_par_libelle text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_annuaire_proprietaire_origine_contact_chk') THEN
    ALTER TABLE gestion_annuaire_proprietaire ADD CONSTRAINT gestion_annuaire_proprietaire_origine_contact_chk
      CHECK (origine_contact IS NULL OR origine_contact IN
        ('collegue', 'apporteur', 'internet', 'recommandation', 'passage_agence', 'campagne', 'personnalise', 'inconnue'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_annuaire_proprietaire_origine_precision_chk') THEN
    ALTER TABLE gestion_annuaire_proprietaire ADD CONSTRAINT gestion_annuaire_proprietaire_origine_precision_chk
      CHECK (origine_contact_precision IS NULL OR char_length(origine_contact_precision) BETWEEN 1 AND 80);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_annuaire_proprietaire_origine_apporteur_fk') THEN
    ALTER TABLE gestion_annuaire_proprietaire ADD CONSTRAINT gestion_annuaire_proprietaire_origine_apporteur_fk
      FOREIGN KEY (origine_apporteur_id) REFERENCES gestion_location_apporteur(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS gestion_annuaire_proprietaire_origine_idx ON gestion_annuaire_proprietaire (origine_contact);

COMMENT ON COLUMN gestion_annuaire_proprietaire.origine_contact IS
  'Origine du contact du propriétaire (425) : héritée par ses nouvelles locations (préremplie, modifiable). « inconnue » : à compléter, non héritée ; NULL : à renseigner.';
COMMENT ON COLUMN gestion_annuaire_proprietaire.origine_contact_precision IS 'Origine « Personnalisé » : le texte (425).';
COMMENT ON COLUMN gestion_annuaire_proprietaire.origine_apporteur_id IS 'Origine « Apporteur d''affaires » : l''apporteur de l''annuaire (425).';
COMMENT ON COLUMN gestion_annuaire_proprietaire.origine_collegue_id IS 'Origine « Collègue directement » : le compte du collègue (425).';
COMMENT ON COLUMN gestion_annuaire_proprietaire.origine_collegue_libelle IS 'Origine « Collègue directement » : le nom du collègue au moment de la saisie (425).';
COMMENT ON COLUMN gestion_annuaire_proprietaire.origine_modifiee_le IS 'Dernière saisie de l''origine du propriétaire (425).';
COMMENT ON COLUMN gestion_annuaire_proprietaire.origine_modifiee_par_libelle IS 'Qui a saisi l''origine en dernier (425).';
