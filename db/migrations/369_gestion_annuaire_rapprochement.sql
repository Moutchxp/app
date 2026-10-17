-- 369_gestion_annuaire_rapprochement.sql — LOT L0 (étude Location, 17/10/2026) : UNE FICHE CRÉÉE DANS L'APPLICATION,
-- PUIS RETROUVÉE DANS L'EXPORT WIPPIMMO, EST RAPPROCHÉE — SANS DOUBLON ET SANS CHANGER SA CLÉ.
--
-- LE BESOIN (Arno, 17/10/2026) : « une fiche manuelle ensuite retrouvée dans l'export → rapprochée sans doublon ».
-- Une fiche créée ici porte une clé « app-… » ; WIPPIMMO l'exporte plus tard sous SON numéro. Sans mémoire du lien,
-- l'import créerait une seconde fiche (même personne, deux cartes).
--
-- 🔴 LA CLÉ DE LA FICHE NE CHANGE JAMAIS : « app-… » porte déjà ses rattachements de mails (inaltérables, migr.
-- 339-340). Le numéro WIPPIMMO reconnu est donc rangé À CÔTÉ, dans `cle_import`, et l'import cherche les deux.
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE : deux colonnes facultatives (`cle_import`, `rapproche_le`) sur les propriétaires,
-- les locataires et les occupations ; un index unique partiel (une clé d'export ne désigne qu'une fiche) ; un CHECK :
-- seule une fiche « app-… » peut être rapprochée. Aucune ligne existante n'est lue ni modifiée.
--
-- IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour de la prod l'enveloppe dans UNE transaction avec son inscription.

ALTER TABLE gestion_annuaire_proprietaire
  ADD COLUMN IF NOT EXISTS cle_import text,
  ADD COLUMN IF NOT EXISTS rapproche_le timestamptz;
ALTER TABLE gestion_annuaire_locataire
  ADD COLUMN IF NOT EXISTS cle_import text,
  ADD COLUMN IF NOT EXISTS rapproche_le timestamptz;
ALTER TABLE gestion_annuaire_occupation
  ADD COLUMN IF NOT EXISTS cle_import text,
  ADD COLUMN IF NOT EXISTS rapproche_le timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS gestion_annuaire_proprietaire_cle_import_uq
  ON gestion_annuaire_proprietaire (cle_import) WHERE cle_import IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS gestion_annuaire_locataire_cle_import_uq
  ON gestion_annuaire_locataire (cle_import) WHERE cle_import IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS gestion_annuaire_occupation_cle_import_uq
  ON gestion_annuaire_occupation (cle_import) WHERE cle_import IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_annuaire_proprietaire_cle_import_chk') THEN
    ALTER TABLE gestion_annuaire_proprietaire ADD CONSTRAINT gestion_annuaire_proprietaire_cle_import_chk
      CHECK (cle_import IS NULL OR wippimmo_id LIKE 'app-%');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_annuaire_locataire_cle_import_chk') THEN
    ALTER TABLE gestion_annuaire_locataire ADD CONSTRAINT gestion_annuaire_locataire_cle_import_chk
      CHECK (cle_import IS NULL OR wippimmo_id LIKE 'app-%');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_annuaire_occupation_cle_import_chk') THEN
    ALTER TABLE gestion_annuaire_occupation ADD CONSTRAINT gestion_annuaire_occupation_cle_import_chk
      CHECK (cle_import IS NULL OR wippimmo_id LIKE 'app-%');
  END IF;
END $$;

COMMENT ON COLUMN gestion_annuaire_proprietaire.cle_import IS 'Fiche créée dans l''application (« app-… ») retrouvée dans l''export WIPPIMMO : le numéro WIPPIMMO reconnu. La clé de la fiche ne change pas (migration 369).';
COMMENT ON COLUMN gestion_annuaire_locataire.cle_import IS 'Fiche créée dans l''application retrouvée dans l''export : la clé personne de l''import reconnue (migration 369).';
COMMENT ON COLUMN gestion_annuaire_occupation.cle_import IS 'Occupation saisie dans l''application retrouvée dans l''export : l''identifiant WIPPIMMO reconnu (migration 369).';
