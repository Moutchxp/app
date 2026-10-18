-- 385_location_edls.sql — TUILE LOCATION (Arno, 19/10/2026) : L'ÉTAT DES LIEUX DE SORTIE (EDLS) PLANIFIÉ.
--
-- LE BESOIN (Arno) : depuis le bloc « Locataires en préavis » de l'accueil Location, « Planifier l'état des lieux de sortie »
-- (date, heure de début et de fin, personne à qui le confier, commentaire) crée une TÂCHE / RENDEZ-VOUS par le module de
-- tâches de la Gestion — aucun second système de tâches, aucune seconde table de tâches : la tâche vit dans `gestion_tache`,
-- sa demande d'acceptation dans `gestion_tache_demande`, son agenda par la synchronisation existante. La date de l'EDLS est
-- la date d'état des lieux de l'occupation (`etat_des_lieux_prevu_le`, migration 384) : une seule donnée.
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE (ajout seul) : une table neuve, le LIEN entre un EDLS (les occupations d'un préavis) et
-- SA tâche. AUCUNE ligne existante n'est modifiée.
--   · `gestion_location_edls` — un lien par EDLS planifié : la tâche, le bien, les occupations concernées, le commentaire,
--     l'auteur. 🔴 RIEN N'EST JAMAIS EFFACÉ : un lien ne se CLÔT (`clos_le`, `clos_motif`) que lorsqu'un nouvel EDLS est
--     planifié pour les mêmes occupations après que la tâche a été annulée ou faite. Verrou EN BASE : ni DELETE, ni
--     TRUNCATE ; un UPDATE ne peut que CLORE une ligne encore ouverte, sans toucher à son contenu. Les déplacements et
--     réattributions sont tracés par le module de tâches (`gestion_tache_action`) et au journal de la Gestion.
--
-- IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction avec son inscription.

CREATE TABLE IF NOT EXISTS gestion_location_edls (
  id bigserial PRIMARY KEY,
  tache_id bigint NOT NULL REFERENCES gestion_tache(id),
  lot_id bigint NOT NULL REFERENCES gestion_annuaire_lot(id),
  occupation_ids bigint[] NOT NULL CONSTRAINT gestion_location_edls_occupations_chk CHECK (cardinality(occupation_ids) > 0),
  commentaire text,
  cree_le timestamptz NOT NULL DEFAULT now(),
  cree_par bigint,
  cree_par_libelle text NOT NULL,
  clos_le timestamptz,
  clos_motif text,
  clos_par_libelle text,
  CONSTRAINT gestion_location_edls_cloture_chk CHECK ((clos_le IS NULL) = (clos_motif IS NULL))
);
CREATE INDEX IF NOT EXISTS gestion_location_edls_par_tache ON gestion_location_edls (tache_id);
CREATE INDEX IF NOT EXISTS gestion_location_edls_ouverts ON gestion_location_edls USING gin (occupation_ids) WHERE clos_le IS NULL;

-- Le verrou : une ligne ne se CLÔT qu'une fois, et rien d'autre ne change ; jamais d'effacement.
CREATE OR REPLACE FUNCTION gestion_location_edls_cloture_seule() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'gestion_location_edls : ajout seul (% refusé) — migration 385', TG_OP;
  END IF;
  IF OLD.clos_le IS NOT NULL THEN
    RAISE EXCEPTION 'gestion_location_edls : ligne déjà close — migration 385';
  END IF;
  IF (NEW.tache_id, NEW.lot_id, NEW.occupation_ids, NEW.commentaire, NEW.cree_le, NEW.cree_par, NEW.cree_par_libelle)
     IS DISTINCT FROM (OLD.tache_id, OLD.lot_id, OLD.occupation_ids, OLD.commentaire, OLD.cree_le, OLD.cree_par, OLD.cree_par_libelle) THEN
    RAISE EXCEPTION 'gestion_location_edls : le contenu d''un lien ne se modifie pas — migration 385';
  END IF;
  IF NEW.clos_le IS NULL THEN
    RAISE EXCEPTION 'gestion_location_edls : un UPDATE ne peut que clore la ligne — migration 385';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS gestion_location_edls_verrou ON gestion_location_edls;
CREATE TRIGGER gestion_location_edls_verrou BEFORE UPDATE OR DELETE ON gestion_location_edls
  FOR EACH ROW EXECUTE FUNCTION gestion_location_edls_cloture_seule();
DROP TRIGGER IF EXISTS gestion_location_edls_no_truncate ON gestion_location_edls;
CREATE TRIGGER gestion_location_edls_no_truncate BEFORE TRUNCATE ON gestion_location_edls
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_location_edls_cloture_seule();

COMMENT ON TABLE gestion_location_edls IS 'État des lieux de sortie planifié : lien entre les occupations d''un préavis et la tâche (rendez-vous) du module de tâches de la Gestion ; jamais effacé, seulement clos — migration 385.';
