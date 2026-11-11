-- 468_location_sortie_pieces_retenue.sql — LOCATION (Arno, 11/11/2026) : « VALIDER L'ÉTAT DES LIEUX DE SORTIE » — PIÈCES JOINTES ET
-- RETENUE DE 20 % DU DÉPÔT DE GARANTIE.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL :
--   · `gestion_location_sortie_piece` — une pièce ajoutée à la fenêtre (depuis le Drive du bien, en LECTURE, ou depuis l'ordinateur) :
--     ses MÉTADONNÉES seulement (nom, type, taille, provenance, empreinte) et la CLÉ de ses octets sur le stockage objet. Jamais les octets
--     en base (CLAUDE.md §7). Ni UPDATE, ni DELETE, ni TRUNCATE : « Retirer » ne retire que de la liste de la fenêtre.
--   · `gestion_location_sortie_validee` — la sortie validée par la fenêtre : logement, occupations, date effective, RETENUE DE 20 %
--     (oui/non) et le moment du choix, la personne qui valide. Ajout seul.
--   · `gestion_location_mail_avis.piece_ids` — les pièces jointes à CHAQUE mail (l'historique du bien, du locataire et du propriétaire
--     les montre avec le mail). Colonne ajoutée avec sa valeur par défaut : aucune ligne existante n'est réécrite.
--
-- Sans elle : la fenêtre n'offre ni pièce ni retenue ; la validation d'avant reste disponible.
--
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE. Suppose 457, 464, 467.

CREATE TABLE IF NOT EXISTS gestion_location_sortie_piece (
  id                 bigserial   PRIMARY KEY,
  occupation_id      bigint      NOT NULL REFERENCES gestion_annuaire_occupation(id),
  provenance         text        NOT NULL CHECK (provenance IN ('drive', 'ordinateur')),
  nom                text        NOT NULL CHECK (btrim(nom) <> ''),
  type_mime          text        NOT NULL,
  taille_octets      bigint      NOT NULL CHECK (taille_octets > 0),
  cle_stockage       text        NOT NULL,
  empreinte_sha256   text        NOT NULL,
  drive_file_id      text,
  ajoute_le          timestamptz NOT NULL DEFAULT now(),
  ajoute_par_id      bigint,
  ajoute_par_libelle text        NOT NULL CHECK (btrim(ajoute_par_libelle) <> '')
);
CREATE INDEX IF NOT EXISTS gestion_location_sortie_piece_occ ON gestion_location_sortie_piece (occupation_id, ajoute_le DESC);

CREATE TABLE IF NOT EXISTS gestion_location_sortie_validee (
  id                 bigserial   PRIMARY KEY,
  lot_id             bigint      NOT NULL REFERENCES gestion_annuaire_lot(id),
  occupation_ids     bigint[]    NOT NULL,
  date_sortie        date        NOT NULL,
  retenue_20         boolean     NOT NULL,
  retenue_choisie_le timestamptz NOT NULL DEFAULT now(),
  piece_ids          bigint[]    NOT NULL DEFAULT '{}',
  valide_le          timestamptz NOT NULL DEFAULT now(),
  auteur_id          bigint,
  auteur_libelle     text        NOT NULL CHECK (btrim(auteur_libelle) <> '')
);
CREATE INDEX IF NOT EXISTS gestion_location_sortie_validee_lot ON gestion_location_sortie_validee (lot_id, valide_le DESC);

CREATE OR REPLACE FUNCTION gestion_location_sortie_ajout_seul() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% : table en ajout seul (migration 468) — rien ne se modifie ni ne s''efface', TG_TABLE_NAME;
END $$;
DROP TRIGGER IF EXISTS gestion_location_sortie_piece_ajout_seul ON gestion_location_sortie_piece;
CREATE TRIGGER gestion_location_sortie_piece_ajout_seul BEFORE UPDATE OR DELETE ON gestion_location_sortie_piece
  FOR EACH ROW EXECUTE FUNCTION gestion_location_sortie_ajout_seul();
DROP TRIGGER IF EXISTS gestion_location_sortie_piece_no_truncate ON gestion_location_sortie_piece;
CREATE TRIGGER gestion_location_sortie_piece_no_truncate BEFORE TRUNCATE ON gestion_location_sortie_piece
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_location_sortie_ajout_seul();
DROP TRIGGER IF EXISTS gestion_location_sortie_validee_ajout_seul ON gestion_location_sortie_validee;
CREATE TRIGGER gestion_location_sortie_validee_ajout_seul BEFORE UPDATE OR DELETE ON gestion_location_sortie_validee
  FOR EACH ROW EXECUTE FUNCTION gestion_location_sortie_ajout_seul();
DROP TRIGGER IF EXISTS gestion_location_sortie_validee_no_truncate ON gestion_location_sortie_validee;
CREATE TRIGGER gestion_location_sortie_validee_no_truncate BEFORE TRUNCATE ON gestion_location_sortie_validee
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_location_sortie_ajout_seul();

ALTER TABLE gestion_location_mail_avis ADD COLUMN IF NOT EXISTS piece_ids bigint[] NOT NULL DEFAULT '{}';

COMMENT ON TABLE gestion_location_sortie_piece IS
  'Pièces jointes au compte rendu de l’état des lieux de sortie — métadonnées et clé de stockage, jamais les octets (migration 468).';
COMMENT ON TABLE gestion_location_sortie_validee IS
  'Sorties validées par « Valider l’état des lieux de sortie » : date effective, retenue de 20 % (oui/non) — ajout seul (migration 468).';
COMMENT ON COLUMN gestion_location_mail_avis.piece_ids IS 'Les pièces jointes au mail (gestion_location_sortie_piece) — migration 468.';
