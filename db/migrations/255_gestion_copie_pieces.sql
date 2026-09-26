-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- MIGRATION 255 — LOT DRIVE-2 : LA COPIE VÉRIFIÉE DES PIÈCES JOINTES VERS « Base de données locative ».
--
-- ═══ 🔴 ON ÉTEND LA TABLE DU LOT 5-PJ-B, ON N'EN CRÉE PAS UNE SECONDE ═══════════════════════════════════════════
-- `gestion_piece_drive` existe déjà (migration 245) : c'est elle que la carte d'une pièce interroge pour afficher
-- « Dans le Drive · ouvrir ». Créer une table parallèle pour la copie de masse donnerait DEUX vérités sur la même
-- question — « cette pièce est-elle dans le Drive ? » — et la carte continuerait d'afficher « non » sur 26 000
-- pièces qui y sont. On ajoute donc ce qui manque, et la carte marche pour les deux voies sans une ligne de code.
--
-- CE QUI MANQUAIT, et pourquoi chaque colonne est nécessaire :
--   · `md5` et `taille_octets` — SANS EUX, « copié » ne veut rien dire. Drive rend l'empreinte du fichier qu'il a
--     reçu ; on la compare à celle calculée sur l'original. Un octet de travers et la copie est refusée ;
--   · `verifie_le` — la DATE de cette comparaison. Une ligne sans elle est une copie DOUTEUSE : elle sera refaite
--     au passage suivant, et le fichier douteux mis à la corbeille Drive. Tant qu'elle est nulle, rien n'est acquis ;
--   · `origine` — 'manuel' (un clic dans l'écran, lot 5-PJ-B) ou 'copie' (la campagne de ce lot). Les deux voies
--     cohabitent dans la même table ; sans cette colonne on ne saurait plus laquelle a produit quoi ;
--   · `regle_tri` et `confiance_tri` — la décision qui a mené le fichier là. C'est ce qui permettra, dans six mois,
--     de comprendre POURQUOI une pièce est dans ce dossier, et de refaire le tri autrement si la règle a déçu.
--
-- 🔴 L'ANTI-DOUBLON EXISTE DÉJÀ ET RESTE INCHANGÉ : `gestion_piece_drive_unique_idx (piece_id, drive_dossier_id)`.
-- La même pièce ne peut pas partir deux fois dans le même dossier. Ce lot y ajoute la règle plus forte qu'il
-- applique lui-même : une pièce VÉRIFIÉE n'est jamais renvoyée, où que ce soit.
--
-- ⚠️ `depose_par_libelle` EST `NOT NULL` SANS DÉFAUT (245) : la campagne écrit 'copie automatique'. Aucune ligne ne
--   peut donc exister sans qu'on sache qui l'a produite — c'est voulu, et on ne l'assouplit pas.
--
-- ═══ LE JOURNAL DES PASSES, ET LE VERROU ════════════════════════════════════════════════════════════════════════
-- `gestion_drive_copie_passe` porte une ligne par passe de copie : début, fin, compteurs, motif d'arrêt. Elle sert
-- à TROIS choses — le suivi en lecture seule pendant la nuit, le rapport de fin, et le VERROU : une passe ouverte
-- (sans `termine_le`) empêche une seconde de démarrer. Deux copies en parallèle se marcheraient dessus et
-- doubleraient les fichiers dans Drive.
--
-- 🔒 AUCUNE DONNÉE PERSONNELLE ICI. Des identifiants, des empreintes, des compteurs. Ni nom, ni adresse, ni contenu.
--
-- POUR APPLIQUER :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/255_gestion_copie_pieces.sql
--
-- POUR REVENIR EN ARRIÈRE (la commande de copie redit « pas encore installé » ; AUCUN fichier Drive n'est touché) :
--   DROP TABLE IF EXISTS gestion_drive_copie_passe;
--   ALTER TABLE gestion_piece_drive DROP COLUMN IF EXISTS md5, DROP COLUMN IF EXISTS taille_octets,
--     DROP COLUMN IF EXISTS verifie_le, DROP COLUMN IF EXISTS origine,
--     DROP COLUMN IF EXISTS regle_tri, DROP COLUMN IF EXISTS confiance_tri;
-- ⚠️ Retirer ces colonnes ne supprime rien dans Drive : on en perd seulement la vérification.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.gestion_piece_drive') IS NULL THEN
    RAISE EXCEPTION 'La migration 245 (dépôts Drive) doit être appliquée AVANT celle-ci.';
  END IF;
  IF to_regclass('public.gestion_drive_arbre') IS NULL THEN
    RAISE EXCEPTION 'La migration 254 (arborescence Drive) doit être appliquée AVANT celle-ci : la copie écrit dedans.';
  END IF;
END $$;

-- ── ① CE QUI MANQUAIT À LA MÉMOIRE DES DÉPÔTS ───────────────────────────────────────────────────────────────────
ALTER TABLE gestion_piece_drive
  -- L'empreinte RENDUE PAR DRIVE pour le fichier qu'il a reçu. NULL pour les dépôts manuels d'avant ce lot.
  ADD COLUMN IF NOT EXISTS md5           text,
  -- La taille RENDUE PAR DRIVE. Comparée à celle de l'original : deux vérifications valent mieux qu'une, et la
  -- taille attrape le cas — rare mais réel — d'un md5 absent de la réponse.
  ADD COLUMN IF NOT EXISTS taille_octets bigint,
  -- 🔴 LA DATE DE VÉRIFICATION. Tant qu'elle est NULLE, la copie n'est PAS acquise : elle sera refaite.
  ADD COLUMN IF NOT EXISTS verifie_le    timestamptz,
  ADD COLUMN IF NOT EXISTS origine       text NOT NULL DEFAULT 'manuel',
  -- La décision de tri qui a mené le fichier là (lot DRIVE-1) : pour comprendre, des mois après, POURQUOI.
  ADD COLUMN IF NOT EXISTS regle_tri     text,
  ADD COLUMN IF NOT EXISTS confiance_tri text;

DO $$
BEGIN
  -- Idempotent : une contrainte déjà posée n'est pas reposée (la migration doit pouvoir se rejouer).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_piece_drive_origine_chk') THEN
    ALTER TABLE gestion_piece_drive
      ADD CONSTRAINT gestion_piece_drive_origine_chk CHECK (origine IN ('manuel', 'copie'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_piece_drive_verifie_chk') THEN
    -- Une ligne VÉRIFIÉE doit porter son empreinte ET sa taille : « vérifié » sans preuve ne veut rien dire.
    ALTER TABLE gestion_piece_drive
      ADD CONSTRAINT gestion_piece_drive_verifie_chk
      CHECK (verifie_le IS NULL OR (md5 IS NOT NULL AND taille_octets IS NOT NULL));
  END IF;
END $$;

-- « Quelles pièces restent à copier ? » — la question posée à chaque passe, sur 26 000 lignes.
CREATE INDEX IF NOT EXISTS gestion_piece_drive_verifie_idx
  ON gestion_piece_drive (piece_id) WHERE verifie_le IS NOT NULL;
-- « Quelles copies sont restées douteuses ? » — celles que la passe suivante doit refaire.
CREATE INDEX IF NOT EXISTS gestion_piece_drive_douteuses_idx
  ON gestion_piece_drive (depose_le) WHERE verifie_le IS NULL;

COMMENT ON COLUMN gestion_piece_drive.verifie_le IS
  'LOT DRIVE-2 — date à laquelle le md5 ET la taille rendus par Drive ont été comparés à l''original. NULL = copie '
  'DOUTEUSE : elle sera refaite au passage suivant, et le fichier douteux mis à la corbeille Drive. Rien n''est '
  'acquis tant que cette date est nulle.';
COMMENT ON COLUMN gestion_piece_drive.origine IS
  'LOT DRIVE-2 — ''manuel'' = un clic dans l''écran (lot 5-PJ-B) ; ''copie'' = la campagne de copie de masse. Les '
  'deux voies partagent cette table pour que la carte d''une pièce dise « Dans le Drive » quelle que soit la voie.';

-- ── ② LE JOURNAL DES PASSES — suivi, rapport, et VERROU ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gestion_drive_copie_passe (
  id                bigserial   PRIMARY KEY,
  demarre_le        timestamptz NOT NULL DEFAULT now(),
  termine_le        timestamptz,
  mode              text        NOT NULL,
  -- L'hôte et le numéro de processus : quand une passe reste ouverte, il faut pouvoir dire QUI la tient.
  hote              text,
  pid               integer,
  limite            integer,
  pieces_vues       integer     NOT NULL DEFAULT 0,
  pieces_copiees    integer     NOT NULL DEFAULT 0,
  pieces_deja       integer     NOT NULL DEFAULT 0,
  pieces_sans_contenu integer   NOT NULL DEFAULT 0,
  pieces_refaites   integer     NOT NULL DEFAULT 0,
  octets_copies     bigint      NOT NULL DEFAULT 0,
  echecs            integer     NOT NULL DEFAULT 0,
  dossiers_crees    integer     NOT NULL DEFAULT 0,
  resultat          text        NOT NULL DEFAULT 'en_cours',
  motif_arret       text,
  CONSTRAINT gestion_drive_copie_passe_mode_chk CHECK (mode IN ('simulation', 'applique')),
  CONSTRAINT gestion_drive_copie_passe_resultat_chk CHECK (resultat IN ('en_cours', 'ok', 'arret', 'echec'))
);

-- 🔴 LE VERROU, TENU PAR LA BASE : une seule passe APPLIQUÉE ouverte à la fois. Deux copies en parallèle
--   doubleraient les fichiers dans Drive — l'anti-doublon ne les verrait pas, chacune écrivant avant que l'autre
--   n'ait enregistré. Un index unique partiel est le verrou le plus simple qui ne puisse pas être oublié.
CREATE UNIQUE INDEX IF NOT EXISTS gestion_drive_copie_passe_verrou
  ON gestion_drive_copie_passe ((1)) WHERE termine_le IS NULL AND mode = 'applique';

CREATE INDEX IF NOT EXISTS gestion_drive_copie_passe_date_idx
  ON gestion_drive_copie_passe (demarre_le DESC);

CREATE OR REPLACE FUNCTION gestion_drive_copie_passe_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Une passe EN COURS se met à jour (compteurs, clôture) ; une passe CLOSE ne se réécrit jamais.
  IF TG_OP = 'UPDATE' AND OLD.termine_le IS NULL THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'gestion_drive_copie_passe est APPEND-ONLY : % interdit sur une passe déjà close.', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
DROP TRIGGER IF EXISTS gestion_drive_copie_passe_no_update_delete ON gestion_drive_copie_passe;
CREATE TRIGGER gestion_drive_copie_passe_no_update_delete
  BEFORE UPDATE OR DELETE ON gestion_drive_copie_passe
  FOR EACH ROW EXECUTE FUNCTION gestion_drive_copie_passe_append_only();
DROP TRIGGER IF EXISTS gestion_drive_copie_passe_no_truncate ON gestion_drive_copie_passe;
CREATE TRIGGER gestion_drive_copie_passe_no_truncate
  BEFORE TRUNCATE ON gestion_drive_copie_passe
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_drive_copie_passe_append_only();

COMMENT ON TABLE gestion_drive_copie_passe IS
  'LOT DRIVE-2 — une ligne par passe de copie. Trois rôles : le suivi en lecture seule pendant la nuit, le rapport '
  'de fin, et le VERROU (index unique partiel : une seule passe appliquée ouverte à la fois — deux copies en '
  'parallèle doubleraient les fichiers dans Drive). Append-only : une passe close ne se réécrit jamais.';

-- ── ③ LE JOURNAL DU MODULE ACCEPTE « copie_piece » ──────────────────────────────────────────────────────────────
ALTER TABLE gestion_journal DROP CONSTRAINT IF EXISTS gestion_journal_entite_chk;
ALTER TABLE gestion_journal
  ADD CONSTRAINT gestion_journal_entite_chk
  CHECK (entite = ANY (ARRAY[
    'message', 'fil', 'evenement', 'affectation', 'regle', 'config', 'releve', 'partenaire',
    'envoi',          -- 243 : un courrier PARTI de chez nous
    'piece_drive',    -- 245 : une pièce jointe COPIÉE dans le Drive (geste manuel)
    'compte_google',  -- 246 : un collaborateur relie ou délie son compte Google
    'annuaire',       -- 253 : un import de l'annuaire WIPPIMMO
    'drive_arbre',    -- 254 : un dossier créé dans « Base de données locative »
    'copie_piece'     -- 255 : une passe de copie de masse
  ]));

COMMIT;
