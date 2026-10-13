-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 348 — LOT TACHES-PIECES-DRIVE : LES PIÈCES JOINTES D'UNE TÂCHE, PAR RÉFÉRENCE AU DRIVE
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- DEMANDE D'ARNO (13/10/2026) : « en créant ou en modifiant une tâche, pouvoir ajouter une ou plusieurs pièces
-- jointes choisies dans le Drive. […] La tâche garde seulement une RÉFÉRENCE au fichier : identifiant Drive, nom,
-- type, lien d'ouverture, et qui l'a ajouté et quand. AUCUNE copie, AUCUN téléchargement. »
--
-- 🔴 UNE RÉFÉRENCE, PAS UN FICHIER : aucune colonne ne porte de contenu. Retirer une pièce d'une tâche la marque
-- retirée (`retire_le`), la ligne reste (trace) ; le fichier du Drive n'est JAMAIS touché.
--
-- 🔴 MIGRATION D'AJOUT, ET SEULEMENT D'AJOUT : une table neuve et ses déclencheurs (la fonction de refus de la 346).
-- Aucune table existante n'est modifiée ; la trace passe par `gestion_tache_action` (« modification »).
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS gestion_tache_piece (
  id                  bigserial   PRIMARY KEY,
  tache_id            bigint      NOT NULL REFERENCES gestion_tache(id),
  drive_fichier_id    text        NOT NULL CHECK (btrim(drive_fichier_id) <> '' AND length(drive_fichier_id) <= 200),
  nom                 text        NOT NULL CHECK (btrim(nom) <> ''),
  type_mime           text,
  lien                text,
  ajoute_le           timestamptz NOT NULL DEFAULT now(),
  ajoute_par_libelle  text        NOT NULL CHECK (btrim(ajoute_par_libelle) <> ''),
  retire_le           timestamptz,
  retire_par_libelle  text,
  CONSTRAINT gestion_tache_piece_retire_chk CHECK ((retire_le IS NULL) = (retire_par_libelle IS NULL))
);

-- Une pièce n'est qu'une fois ACTIVE dans une tâche ; retirée puis rajoutée, elle reprend une ligne neuve.
CREATE UNIQUE INDEX IF NOT EXISTS gestion_tache_piece_active_uq
  ON gestion_tache_piece (tache_id, drive_fichier_id) WHERE retire_le IS NULL;
CREATE INDEX IF NOT EXISTS gestion_tache_piece_tache_idx ON gestion_tache_piece (tache_id);

DROP TRIGGER IF EXISTS gestion_tache_piece_no_delete ON gestion_tache_piece;
CREATE TRIGGER gestion_tache_piece_no_delete BEFORE DELETE ON gestion_tache_piece
  FOR EACH ROW EXECUTE FUNCTION gestion_tache_refuser_suppression();
DROP TRIGGER IF EXISTS gestion_tache_piece_no_truncate ON gestion_tache_piece;
CREATE TRIGGER gestion_tache_piece_no_truncate BEFORE TRUNCATE ON gestion_tache_piece
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_tache_refuser_suppression();

COMMIT;
