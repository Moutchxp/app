-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- MIGRATION 260 — LOT DRIVE-3 : LE REGISTRE DU VIDAGE DU STOCKAGE.
--
-- ═══ CE QUE LE LOT PRÉPARE ══════════════════════════════════════════════════════════════════════════════════════
-- Les pièces jointes sont copiées dans le Drive et vérifiées par leur empreinte. Une fois la copie PROUVÉE, le
-- contenu peut quitter MinIO — et l'application continue de le servir, en le relisant dans le Drive. L'utilisateur
-- ne perd rien : même nom, même type, même octets, tout au plus un délai.
--
-- ═══ 🔴 UNE SEULE VÉRITÉ : CETTE TABLE ══════════════════════════════════════════════════════════════════════════
-- « Le contenu est-il encore dans MinIO ? » est une question à laquelle il faut répondre à CHAQUE téléchargement.
-- On aurait pu poser un drapeau sur `gestion_piece` ET tenir un journal à côté : deux écritures pour un seul fait,
-- donc deux vérités qui finiraient par diverger — et c'est toujours celle qu'on regarde le moins qui garde le faux.
-- Il n'y a donc QU'UNE table : elle est à la fois l'ÉTAT (une ligne = ce contenu n'est plus dans MinIO) et la PREUVE
-- (ce qui a été effacé, quand, avec quelle empreinte, et vers quel fichier Drive on renvoie désormais).
--
-- ⚠️ `cle_stockage` N'EST JAMAIS EFFACÉE de `gestion_piece`. La clé reste : elle dit où l'objet était, elle sert au
-- rapprochement, et un jour elle servira peut-être à le remettre. Ce lot enlève des OCTETS, pas des informations.
--
-- ═══ 🔴 CE QUE LA TABLE OBLIGE À ÉCRIRE, ET POURQUOI CHAQUE COLONNE ═════════════════════════════════════════════
--   · `md5` et `taille_octets` — l'empreinte de CE QUI A ÉTÉ EFFACÉ. Sans elles, on ne pourrait plus démontrer, un
--     an après, que le fichier Drive servi aujourd'hui est bien l'objet qui a quitté MinIO ;
--   · `drive_file_id` — vers quoi l'application renvoie maintenant. C'est le seul chemin de lecture restant ;
--   · `drive_md5` et `drive_taille` — ce que Drive rendait AU MOMENT de l'effacement, relu juste avant. Les garder à
--     part de `md5` permet de prouver l'égalité au lieu de l'affirmer ;
--   · `verifie_le` — la date de la vérification qui a autorisé l'effacement.
--
-- 🔴 AJOUT SEUL, TENU PAR UN TRIGGER. On n'efface pas la trace d'un effacement, et on ne la corrige pas.
--
-- ⚠️ SANS CETTE MIGRATION, TOUT FONCTIONNE COMME AVANT. La sonde `vidageDisponible` est consultée avant chaque
-- lecture : absente, l'application sert les pièces depuis MinIO exactement comme aujourd'hui, et la commande de
-- vidage refuse de s'exécuter. Une passe de copie tourne au moment où ce lot est livré : elle ne doit rien voir.
--
-- 🔒 AUCUNE DONNÉE PERSONNELLE : elle crée une table vide. Une ligne portera une clé de stockage, une empreinte et un
-- identifiant Drive — jamais le contenu d'une pièce.
--
-- POUR APPLIQUER :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/260_gestion_piece_vidage.sql
--
-- POUR REVENIR EN ARRIÈRE (⚠️ à ne faire que si AUCUN vidage n'a eu lieu : sinon l'application ne saurait plus où
-- lire les pièces dont le contenu a quitté MinIO) :
--   DROP TABLE IF EXISTS gestion_piece_vidage;
--   DROP FUNCTION IF EXISTS gestion_piece_vidage_append_only();
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.gestion_piece_drive') IS NULL THEN
    RAISE EXCEPTION 'La migration 245 (dépôts Drive) doit être appliquée AVANT celle-ci.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'gestion_piece_drive' AND column_name = 'verifie_le') THEN
    RAISE EXCEPTION 'La migration 255 (vérification des copies) doit être appliquée AVANT celle-ci : sans '
                    '`verifie_le`, « copie prouvée » ne voudrait rien dire.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS gestion_piece_vidage (
  id             bigserial   PRIMARY KEY,
  -- 🔴 UNE PIÈCE N'EST VIDÉE QU'UNE FOIS. L'unicité est la garantie d'idempotence de la commande : relancer ne
  --   peut pas produire une seconde ligne, donc pas un second effacement compté.
  piece_id       bigint      NOT NULL UNIQUE REFERENCES gestion_piece(id) ON DELETE CASCADE,
  -- Où l'objet ÉTAIT. `gestion_piece.cle_stockage` la garde aussi : ici c'est la valeur au moment de l'effacement.
  cle_stockage   text        NOT NULL,
  md5            text        NOT NULL,
  taille_octets  bigint      NOT NULL,
  -- Vers quoi l'application lit désormais, et ce que Drive rendait juste avant qu'on efface.
  drive_file_id  text        NOT NULL,
  drive_md5      text        NOT NULL,
  drive_taille   bigint      NOT NULL,
  verifie_le     timestamptz NOT NULL,
  vide_le        timestamptz NOT NULL DEFAULT now(),
  auteur_libelle text        NOT NULL DEFAULT 'vidage automatique',
  CONSTRAINT gestion_piece_vidage_cle_chk    CHECK (btrim(cle_stockage) <> ''),
  CONSTRAINT gestion_piece_vidage_drive_chk  CHECK (btrim(drive_file_id) <> ''),
  -- 🔴 L'ÉGALITÉ DES EMPREINTES EST TENUE EN BASE, pas seulement par le code. Une ligne qui prétendrait qu'on a
  --   effacé un objet dont la copie Drive diffère ne peut pas exister.
  CONSTRAINT gestion_piece_vidage_egalite_chk CHECK (md5 = drive_md5 AND taille_octets = drive_taille)
);

-- « Ce contenu est-il encore dans MinIO ? » — la question posée à CHAQUE téléchargement. `piece_id` est déjà unique,
-- donc déjà indexé : rien à ajouter. Celui-ci sert au rapport, du plus récent au plus ancien.
CREATE INDEX IF NOT EXISTS gestion_piece_vidage_date_idx ON gestion_piece_vidage (vide_le DESC);

CREATE OR REPLACE FUNCTION gestion_piece_vidage_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'gestion_piece_vidage est APPEND-ONLY (preuve d''effacement) : % interdit.', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
DROP TRIGGER IF EXISTS gestion_piece_vidage_no_update_delete ON gestion_piece_vidage;
CREATE TRIGGER gestion_piece_vidage_no_update_delete
  BEFORE UPDATE OR DELETE ON gestion_piece_vidage
  FOR EACH ROW EXECUTE FUNCTION gestion_piece_vidage_append_only();
DROP TRIGGER IF EXISTS gestion_piece_vidage_no_truncate ON gestion_piece_vidage;
CREATE TRIGGER gestion_piece_vidage_no_truncate
  BEFORE TRUNCATE ON gestion_piece_vidage
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_piece_vidage_append_only();

COMMENT ON TABLE gestion_piece_vidage IS
  'LOT DRIVE-3 — une ligne par pièce dont le CONTENU a quitté MinIO parce que sa copie Drive est prouvée. Elle est à '
  'la fois l''ÉTAT (l''application lit désormais dans le Drive) et la PREUVE (empreinte effacée, empreinte Drive '
  'relue juste avant, identifiant du fichier). Append-only. `gestion_piece.cle_stockage` n''est jamais effacée : ce '
  'lot enlève des octets, pas des informations.';
COMMENT ON COLUMN gestion_piece_vidage.drive_md5 IS
  'Ce que Drive rendait AU MOMENT de l''effacement, relu juste avant. Gardé à part de `md5` pour pouvoir PROUVER '
  'l''égalité des deux, au lieu de l''affirmer.';

-- ── LE JOURNAL DU MODULE ────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE gestion_journal DROP CONSTRAINT IF EXISTS gestion_journal_entite_chk;
ALTER TABLE gestion_journal
  ADD CONSTRAINT gestion_journal_entite_chk
  CHECK (entite = ANY (ARRAY[
    'message', 'fil', 'evenement', 'affectation', 'regle', 'config', 'releve', 'partenaire',
    'envoi', 'piece_drive', 'compte_google', 'annuaire', 'drive_arbre', 'copie_piece',
    'adresses_messages', 'production_drive', 'rattachement',
    'vidage_stockage'   -- 260 : une passe de vidage du stockage de l'application
  ]));

COMMIT;
