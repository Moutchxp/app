-- 380_location_origine_archivage.sql — TUILE LOCATION (Arno, 18/10/2026) : L'ORIGINE DE L'ARCHIVAGE D'UN PROPRIÉTAIRE.
--
-- LE BESOIN (Arno) : « Dernière question avant l'archivage définitif : Quelle est l'origine de l'archivage de ce
-- propriétaire ? — Récupéré par le propriétaire / sa famille · Mise en vente (par notre agence / par une autre agence /
-- par lui-même / indéterminé) · Propriétaire mécontent · Décès / succession · Litige ; une Précision libre facultative.
-- Enregistrée avec la date et l'auteur, affichée sur la fiche archivée (Location et Gestion, même donnée). La
-- réactivation ne l'efface pas : elle reste dans l'historique. Le serveur refuse un archivage sans origine. »
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE (ajout seul) : une table neuve `gestion_proprietaire_archivage_origine`, UNE LIGNE PAR
-- ARCHIVAGE (un propriétaire archivé, réactivé puis archivé de nouveau en a deux). Codes STABLES (contrôlés), le libellé
-- vit dans le code. `archive_le` = l'instant même de la sortie du portefeuille (`sorti_portefeuille_le`) : c'est ce qui
-- relie la ligne à l'archivage affiché. 🔴 EN AJOUT SEUL, VERROUILLÉ EN BASE : ni UPDATE, ni DELETE, ni TRUNCATE (même
-- fonction que les liens d'annexe, migration 372) — la réactivation ne touche pas cette table.
-- AUCUNE ligne existante n'est modifiée.
--
-- IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction avec son inscription.

CREATE TABLE IF NOT EXISTS gestion_proprietaire_archivage_origine (
  id bigserial PRIMARY KEY,
  proprietaire_id bigint NOT NULL REFERENCES gestion_annuaire_proprietaire(id),
  origine text NOT NULL CONSTRAINT gestion_prop_arch_origine_chk
    CHECK (origine IN ('recupere_proprietaire', 'mise_en_vente', 'mecontent', 'deces_succession', 'litige')),
  sous_origine text CONSTRAINT gestion_prop_arch_sous_origine_chk
    CHECK (sous_origine IS NULL OR sous_origine IN ('notre_agence', 'autre_agence', 'lui_meme', 'indetermine')),
  precision_libre text,
  archive_le timestamptz NOT NULL,
  archive_par_libelle text NOT NULL,
  cree_le timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gestion_prop_arch_vente_chk CHECK ((origine = 'mise_en_vente') = (sous_origine IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS gestion_prop_arch_origine_par_proprietaire
  ON gestion_proprietaire_archivage_origine (proprietaire_id, archive_le DESC);

DROP TRIGGER IF EXISTS gestion_prop_arch_origine_ajout_seul ON gestion_proprietaire_archivage_origine;
CREATE TRIGGER gestion_prop_arch_origine_ajout_seul BEFORE UPDATE OR DELETE ON gestion_proprietaire_archivage_origine
  FOR EACH ROW EXECUTE FUNCTION gestion_ajout_seul_refuser();
DROP TRIGGER IF EXISTS gestion_prop_arch_origine_no_truncate ON gestion_proprietaire_archivage_origine;
CREATE TRIGGER gestion_prop_arch_origine_no_truncate BEFORE TRUNCATE ON gestion_proprietaire_archivage_origine
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_ajout_seul_refuser();

COMMENT ON TABLE gestion_proprietaire_archivage_origine IS 'Origine de chaque archivage d''un propriétaire (tuile Location) : code stable, sous-origine (mise en vente), précision, date et auteur ; en ajout seul, conservée après réactivation — migration 380.';
