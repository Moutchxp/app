-- 386_location_regroupement.sql — TUILE LOCATION (Arno, 19/10/2026) : UNE FICHE BIEN = LES LOTS LOUÉS ENSEMBLE.
--
-- LE BESOIN (Arno) : « Une fiche bien = l'ensemble des lots loués ensemble (aux mêmes locataires, même bail). Exemple :
-- appartement + cave n°3 + parking n°14 ; un nouveau locataire ne loue que la cave et le parking → la cave et le parking
-- forment UNE NOUVELLE fiche bien à deux lots, rattachée à ce locataire ; l'appartement devient un bien orphelin dans sa
-- propre fiche. Le lien vers la fiche d'origine est conservé pour chaque lot. Dès que TOUS les lots d'une même fiche
-- d'origine sont de nouveau loués aux mêmes locataires, ils se réunissent automatiquement en une seule fiche ; les fiches
-- intermédiaires ne sont jamais supprimées (statut « réintégrée », consultables). »
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE (ajout seul) : une table neuve, `gestion_bien_regroupement` — une ligne par FICHE BIEN
-- AUTONOME issue d'une fiche d'origine (un lot seul, ou plusieurs lots loués ensemble) : la fiche d'origine (le logement),
-- le lot qui la présente, ses lots, la raison, l'auteur. AUCUNE ligne existante n'est modifiée.
--   · 🔴 LE LIEN ANNEXE → LOGEMENT (`gestion_lot_annexe`, migration 372, en ajout seul) N'EST PAS TOUCHÉ : chaque lot garde
--     à vie son lien vers la fiche d'origine. Le détachement reste la marque `annexe_detachee_le` (migration 379).
--   · 🔴 RIEN N'EST JAMAIS EFFACÉ : une fiche autonome se CLÔT (`clos_le`, `clos_statut` « reintegre » ou « remplace ») et
--     reste consultable. Verrou EN BASE : ni DELETE, ni TRUNCATE ; un UPDATE ne peut que CLORE une ligne encore ouverte.
--
-- IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction avec son inscription.

CREATE TABLE IF NOT EXISTS gestion_bien_regroupement (
  id bigserial PRIMARY KEY,
  -- La fiche d'origine : le logement (« vaisseau mère ») dont les lots sont issus.
  origine_id bigint NOT NULL REFERENCES gestion_annuaire_lot(id),
  -- Le lot dont la fiche présente le bien autonome.
  tete_id bigint NOT NULL REFERENCES gestion_annuaire_lot(id),
  lot_ids bigint[] NOT NULL CONSTRAINT gestion_bien_regroupement_lots_chk CHECK (cardinality(lot_ids) >= 1),
  -- « bail » (lots loués ensemble), « orphelin » (lot libre non repris), « autre_locataire » (lot loué à d'autres),
  -- « detacher » (geste « Détacher »), « scission » (reste d'un bien autonome dont une partie a été louée à part).
  motif text NOT NULL CONSTRAINT gestion_bien_regroupement_motif_chk
    CHECK (motif IN ('bail', 'orphelin', 'autre_locataire', 'detacher', 'scission')),
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par bigint,
  cree_par_libelle text NOT NULL,
  clos_le timestamptz,
  clos_statut text CONSTRAINT gestion_bien_regroupement_statut_chk CHECK (clos_statut IS NULL OR clos_statut IN ('reintegre', 'remplace')),
  clos_par_libelle text,
  CONSTRAINT gestion_bien_regroupement_cloture_chk CHECK ((clos_le IS NULL) = (clos_statut IS NULL)),
  CONSTRAINT gestion_bien_regroupement_tete_chk CHECK (tete_id = ANY (lot_ids))
);
CREATE INDEX IF NOT EXISTS gestion_bien_regroupement_ouverts ON gestion_bien_regroupement USING gin (lot_ids) WHERE clos_le IS NULL;
CREATE INDEX IF NOT EXISTS gestion_bien_regroupement_par_origine ON gestion_bien_regroupement (origine_id);
CREATE INDEX IF NOT EXISTS gestion_bien_regroupement_tous_lots ON gestion_bien_regroupement USING gin (lot_ids);

-- Le verrou : une ligne ne se CLÔT qu'une fois, et rien d'autre ne change ; jamais d'effacement.
CREATE OR REPLACE FUNCTION gestion_bien_regroupement_cloture_seule() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'gestion_bien_regroupement : ajout seul (% refusé) — migration 386', TG_OP;
  END IF;
  IF OLD.clos_le IS NOT NULL THEN
    RAISE EXCEPTION 'gestion_bien_regroupement : ligne déjà close — migration 386';
  END IF;
  IF (NEW.origine_id, NEW.tete_id, NEW.lot_ids, NEW.motif, NEW.cree_le, NEW.cree_par, NEW.cree_par_libelle)
     IS DISTINCT FROM (OLD.origine_id, OLD.tete_id, OLD.lot_ids, OLD.motif, OLD.cree_le, OLD.cree_par, OLD.cree_par_libelle) THEN
    RAISE EXCEPTION 'gestion_bien_regroupement : le contenu d''une fiche autonome ne se modifie pas — migration 386';
  END IF;
  IF NEW.clos_le IS NULL THEN
    RAISE EXCEPTION 'gestion_bien_regroupement : un UPDATE ne peut que clore la ligne — migration 386';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS gestion_bien_regroupement_verrou ON gestion_bien_regroupement;
CREATE TRIGGER gestion_bien_regroupement_verrou BEFORE UPDATE OR DELETE ON gestion_bien_regroupement
  FOR EACH ROW EXECUTE FUNCTION gestion_bien_regroupement_cloture_seule();
DROP TRIGGER IF EXISTS gestion_bien_regroupement_no_truncate ON gestion_bien_regroupement;
CREATE TRIGGER gestion_bien_regroupement_no_truncate BEFORE TRUNCATE ON gestion_bien_regroupement
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_bien_regroupement_cloture_seule();

COMMENT ON TABLE gestion_bien_regroupement IS 'Fiche bien autonome issue d''une fiche d''origine (un lot, ou des lots loués ensemble) ; le lien annexe → logement reste dans gestion_lot_annexe ; jamais effacée, seulement close (réintégrée / remplacée) — migration 386.';
