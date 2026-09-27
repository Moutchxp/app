-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- MIGRATION 262 — LOT CLASSEMENT-1 : LE REGISTRE DES DÉPLACEMENTS DE PIÈCES DANS LE DRIVE.
--
-- ⚠️ ELLE N'EST PAS NÉCESSAIRE POUR LE PLAN. La simulation (`gestion:classement:plan`) ne lit que l'existant et
-- n'écrit rien : elle tourne sans cette table. Celle-ci ne sert qu'au jour où Arno autorisera les déplacements réels.
-- Elle est livrée maintenant pour qu'il n'y ait pas de migration à écrire dans l'urgence ce jour-là.
--
-- ═══ CE QUE LA TABLE EST, ET CE QU'ELLE N'EST PAS ═══════════════════════════════════════════════════════════════
-- Elle est la PREUVE qu'un fichier a été déplacé : d'où, vers où, sur quelle règle, avec quel degré de certitude, et
-- quand. Elle n'est PAS l'état courant du Drive : l'état courant, c'est le Drive lui-même, et le relire est toujours
-- plus vrai que de croire une table. Cette distinction est la même que pour `gestion_piece_vidage` (260) : on
-- enregistre un GESTE, pas une situation.
--
-- 🔴 POURQUOI « D'OÙ » EST OBLIGATOIRE. Un déplacement Drive retire un parent et en ajoute un autre. Sans garder le
-- parent d'origine, un retour en arrière serait impossible : on saurait qu'on a bougé le fichier, sans savoir d'où.
-- C'est la seule colonne qui rend le geste réversible, et c'est pour cela qu'elle est NOT NULL.
--
-- 🔴 AJOUT SEUL, TENU PAR UN TRIGGER. On ne corrige pas la trace d'un déplacement, et on ne l'efface pas.
--
-- ⚠️ PAS D'UNICITÉ SUR `piece_id` — contrairement au registre de vidage. Une pièce peut légitimement être déplacée
-- plusieurs fois : d'« 00 Arrivée des mails » vers « En attente » du bien, puis d'« En attente » vers « 2 Travaux »
-- quand un humain a tranché. L'unicité y interdirait la seconde étape, qui est justement le travail utile.
--
-- ⚠️ SANS CETTE MIGRATION, TOUT FONCTIONNE COMME AVANT : la sonde `classementDisponible` est consultée avant chaque
-- écriture, et le plan comme l'application se comportent exactement à l'identique.
--
-- 🔒 AUCUNE DONNÉE PERSONNELLE : la table est vide. Une ligne portera des identifiants Drive, un chemin de dossier et
-- une règle — jamais le contenu d'une pièce, jamais le nom d'une personne.
--
-- POUR APPLIQUER (à ne faire que le jour où les déplacements réels sont autorisés) :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/262_gestion_piece_classement.sql
--
-- POUR REVENIR EN ARRIÈRE (les fichiers déplacés le restent : cette table n'est qu'un registre) :
--   DROP TABLE IF EXISTS gestion_piece_classement;
--   DROP FUNCTION IF EXISTS gestion_piece_classement_append_only();
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.gestion_piece_drive') IS NULL THEN
    RAISE EXCEPTION 'La migration 245 (dépôts Drive) doit être appliquée AVANT celle-ci.';
  END IF;
  IF to_regclass('public.gestion_drive_arbre') IS NULL THEN
    RAISE EXCEPTION 'La migration 254 (arborescence Drive) doit être appliquée AVANT celle-ci : sans la liste '
                    'blanche des dossiers, aucun déplacement ne peut être autorisé.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS gestion_piece_classement (
  id                 bigserial   PRIMARY KEY,
  piece_id           bigint      NOT NULL REFERENCES gestion_piece(id) ON DELETE CASCADE,
  drive_file_id      text        NOT NULL,
  -- 🔴 D'OÙ. La seule colonne qui rend le geste réversible. Plusieurs parents possibles : on les garde tous.
  parents_avant      text[]      NOT NULL,
  -- Vers où : l'identifiant du dossier, et son chemin AU MOMENT du déplacement (le chemin peut changer ensuite).
  dossier_apres      text        NOT NULL,
  chemin_apres       text            NULL,
  -- Ce qui a décidé, tel que le rapport le lira.
  regle              text        NOT NULL,
  certitude          text        NOT NULL,
  -- Un raccourci posé ailleurs (pièce concernant plusieurs biens) : le dossier et l'identifiant du raccourci.
  raccourci_dossier  text            NULL,
  raccourci_id       text            NULL,
  deplace_le         timestamptz NOT NULL DEFAULT now(),
  auteur_libelle     text        NOT NULL DEFAULT 'classement automatique',
  CONSTRAINT gestion_piece_classement_certitude_chk
    CHECK (certitude = ANY (ARRAY['certaine', 'probable', 'incertaine'])),
  CONSTRAINT gestion_piece_classement_regle_chk   CHECK (btrim(regle) <> ''),
  CONSTRAINT gestion_piece_classement_apres_chk   CHECK (btrim(dossier_apres) <> ''),
  CONSTRAINT gestion_piece_classement_avant_chk   CHECK (array_length(parents_avant, 1) >= 1),
  -- 🔴🔴 LE DOSSIER D'ARRIVÉE NE PEUT PAS ÊTRE DANS LA PRODUCTION. Le garde vit dans le code (`toucheLaProduction`),
  --   mais l'écrire AUSSI en base est la ceinture de sécurité : même une ligne insérée à la main est refusée.
  CONSTRAINT gestion_piece_classement_production_chk CHECK (
    coalesce(chemin_apres, '') !~* '(documents clients scannes|documents clients scannés|1 actifs|2 vendus|3 perdus)')
);

-- « Cette pièce a-t-elle déjà été rangée, et où ? » — la question du rapport et d'une reprise.
CREATE INDEX IF NOT EXISTS gestion_piece_classement_piece_idx ON gestion_piece_classement (piece_id, deplace_le DESC);
CREATE INDEX IF NOT EXISTS gestion_piece_classement_date_idx  ON gestion_piece_classement (deplace_le DESC);

CREATE OR REPLACE FUNCTION gestion_piece_classement_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'gestion_piece_classement est APPEND-ONLY (preuve de déplacement) : % interdit.', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
DROP TRIGGER IF EXISTS gestion_piece_classement_no_update_delete ON gestion_piece_classement;
CREATE TRIGGER gestion_piece_classement_no_update_delete
  BEFORE UPDATE OR DELETE ON gestion_piece_classement
  FOR EACH ROW EXECUTE FUNCTION gestion_piece_classement_append_only();
DROP TRIGGER IF EXISTS gestion_piece_classement_no_truncate ON gestion_piece_classement;
CREATE TRIGGER gestion_piece_classement_no_truncate
  BEFORE TRUNCATE ON gestion_piece_classement
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_piece_classement_append_only();

COMMENT ON TABLE gestion_piece_classement IS
  'LOT CLASSEMENT-1 — une ligne par DÉPLACEMENT d''une pièce dans le Drive : d''où, vers où, sur quelle règle. '
  'Append-only. Ce n''est pas l''état courant du Drive (le Drive lui-même fait foi) mais la trace du geste, et le '
  'seul moyen de revenir en arrière.';
COMMENT ON COLUMN gestion_piece_classement.parents_avant IS
  'Les dossiers d''où le fichier a été retiré. NOT NULL et non vide : sans eux, le déplacement est irréversible.';

-- ── LE JOURNAL DU MODULE ────────────────────────────────────────────────────────────────────────────────────────
-- 🔴 ON AJOUTE À LA LISTE EXISTANTE, ON NE LA RÉÉCRIT PAS — leçon des migrations 260 et 261, qui s'effaçaient l'une
--   l'autre selon l'ordre d'application. Lire la contrainte en place et y insérer la valeur rend l'ordre indifférent
--   et le geste réexécutable.
DO $$
DECLARE def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def
    FROM pg_constraint WHERE conname = 'gestion_journal_entite_chk' AND conrelid = 'gestion_journal'::regclass;
  IF def IS NULL THEN
    RAISE EXCEPTION 'La contrainte gestion_journal_entite_chk est introuvable : le module gestion est-il installé ?';
  END IF;
  IF position('''classement''' IN def) > 0 THEN RETURN; END IF;
  EXECUTE 'ALTER TABLE gestion_journal DROP CONSTRAINT gestion_journal_entite_chk';
  EXECUTE 'ALTER TABLE gestion_journal ADD CONSTRAINT gestion_journal_entite_chk '
          || replace(def, 'ARRAY[', 'ARRAY[''classement''::text, ');
END $$;

COMMIT;
