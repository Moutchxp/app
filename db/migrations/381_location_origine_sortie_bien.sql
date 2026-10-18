-- 381_location_origine_sortie_bien.sql — TUILE LOCATION (Arno, 18/10/2026) : L'ORIGINE DE LA SORTIE D'UN BIEN.
--
-- LE BESOIN (Arno) : « Supprimer un des biens d'un propriétaire » — chaque bien sélectionné et ses annexes sortent du
-- portefeuille (jamais d'effacement, réactivables) ; « origine, date et auteur enregistrés sur chaque bien ». Mêmes cinq
-- origines que l'archivage d'un propriétaire (migration 380), même sous-question pour la mise en vente, même précision.
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE (ajout seul) : une table neuve `gestion_lot_sortie_origine`, UNE LIGNE PAR BIEN SORTI
-- (un bien réactivé puis ressorti en a deux). `sorti_le` = l'instant même de la sortie (`sorti_portefeuille_le` du lot) :
-- c'est ce qui relie la ligne à la sortie affichée. `proprietaire_id` = le propriétaire depuis la fiche duquel la sortie
-- a été faite (information). 🔴 EN AJOUT SEUL, VERROUILLÉ EN BASE : ni UPDATE, ni DELETE, ni TRUNCATE (même fonction que
-- les liens d'annexe, migration 372) — la réactivation ne touche pas cette table. AUCUNE ligne existante n'est modifiée.
--
-- IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction avec son inscription.

CREATE TABLE IF NOT EXISTS gestion_lot_sortie_origine (
  id bigserial PRIMARY KEY,
  lot_id bigint NOT NULL REFERENCES gestion_annuaire_lot(id),
  proprietaire_id bigint REFERENCES gestion_annuaire_proprietaire(id),
  origine text NOT NULL CONSTRAINT gestion_lot_sortie_origine_chk
    CHECK (origine IN ('recupere_proprietaire', 'mise_en_vente', 'mecontent', 'deces_succession', 'litige')),
  sous_origine text CONSTRAINT gestion_lot_sortie_sous_origine_chk
    CHECK (sous_origine IS NULL OR sous_origine IN ('notre_agence', 'autre_agence', 'lui_meme', 'indetermine')),
  precision_libre text,
  sorti_le timestamptz NOT NULL,
  sorti_par_libelle text NOT NULL,
  cree_le timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gestion_lot_sortie_vente_chk CHECK ((origine = 'mise_en_vente') = (sous_origine IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS gestion_lot_sortie_origine_par_lot ON gestion_lot_sortie_origine (lot_id, sorti_le DESC);

DROP TRIGGER IF EXISTS gestion_lot_sortie_origine_ajout_seul ON gestion_lot_sortie_origine;
CREATE TRIGGER gestion_lot_sortie_origine_ajout_seul BEFORE UPDATE OR DELETE ON gestion_lot_sortie_origine
  FOR EACH ROW EXECUTE FUNCTION gestion_ajout_seul_refuser();
DROP TRIGGER IF EXISTS gestion_lot_sortie_origine_no_truncate ON gestion_lot_sortie_origine;
CREATE TRIGGER gestion_lot_sortie_origine_no_truncate BEFORE TRUNCATE ON gestion_lot_sortie_origine
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_ajout_seul_refuser();

COMMENT ON TABLE gestion_lot_sortie_origine IS 'Origine de chaque sortie d''un bien du portefeuille (tuile Location, « Supprimer un des biens ») : code stable, sous-origine, précision, date et auteur ; en ajout seul, conservée après réactivation — migration 381.';
