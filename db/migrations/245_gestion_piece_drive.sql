-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- MIGRATION 245 — LOT 5-PJ-B : LA MÉMOIRE DES DÉPÔTS DANS LE GOOGLE DRIVE.
--
-- CE QUE CETTE TABLE EST. Une pièce jointe a été COPIÉE dans un dossier du Drive : on retient laquelle, où, par qui
-- et quand. Rien de plus. Elle ne décrit PAS l'arborescence du Drive — celle-ci existe déjà, construite à la main
-- depuis des années, et la règle d'Arno est de « ne pas réinventer le monde ». Aucun dossier n'est créé, renommé,
-- déplacé ni supprimé par ce module.
--
-- 🔴 L'ANTI-DOUBLON EST UNE CONTRAINTE, PAS UNE VÉRIFICATION APPLICATIVE. `(piece_id, drive_dossier_id)` est UNIQUE :
-- redéposer la même pièce dans le MÊME dossier est refusé PAR LA BASE, et l'écran propose alors le lien vers le
-- fichier déjà là. Un contrôle fait seulement dans le code laisserait passer deux clics simultanés — et un Drive de
-- gestion n'a pas besoin de deux exemplaires du même bail. La même pièce dans un AUTRE dossier reste possible : une
-- facture concerne parfois deux propriétaires.
--
-- 🔴 AUCUN `ON DELETE CASCADE` sur `piece_id`, exprès. Rien n'est jamais supprimé dans ce module, et si une pièce
-- devait un jour l'être, la trace de son dépôt dans le Drive devrait LUI SURVIVRE : le fichier, lui, serait toujours
-- là-bas. Une trace qui disparaît avec son objet ne prouve plus rien.
--
-- 🔴 `depose_par_libelle` EST FIGÉ EN TEXTE, comme tous les gestes du module : des années après, on doit savoir qui a
-- déposé, même si le compte a été désactivé ou purgé.
--
-- ⚠️ CE QUE LA TABLE NE GARANTIT PAS : que le fichier soit TOUJOURS dans le Drive. Quelqu'un peut l'y déplacer ou le
-- supprimer depuis Google, et nous n'en saurons rien — nous ne surveillons pas le Drive. Le lien `web_view_link`
-- peut donc pointer vers un fichier disparu ; l'écran doit le dire plutôt que de promettre.
--
-- La liste des entités du journal est élargie à `piece_drive` : un dépôt est un geste, et tout geste est journalisé.
--
-- POUR APPLIQUER :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/245_gestion_piece_drive.sql
--
-- POUR REVENIR EN ARRIÈRE (les fichiers déjà déposés restent dans le Drive, évidemment) :
--   DROP TABLE IF EXISTS gestion_piece_drive;
--   (et, si l'on y tient, remettre la contrainte d'entité du journal telle qu'elle était en 243.)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

CREATE TABLE IF NOT EXISTS gestion_piece_drive (
  id                bigserial   PRIMARY KEY,
  piece_id          bigint      NOT NULL REFERENCES gestion_piece(id),
  -- Identifiants Google. Opaques : on ne les interprète jamais, on les rend tels quels.
  drive_file_id     text        NOT NULL,
  drive_dossier_id  text        NOT NULL,
  -- Le NOM du dossier au moment du dépôt. Recopié exprès : s'il est renommé dans le Drive, la carte doit continuer
  --   de dire où l'on avait déposé — la vérité d'alors, pas celle d'aujourd'hui.
  dossier_nom       text,
  -- Drive partagé d'accueil ; NULL = « Mon Drive » du compte de gestion.
  drive_id          text,
  web_view_link     text,
  depose_le         timestamptz NOT NULL DEFAULT now(),
  depose_par        bigint,                       -- pas de FK : la trace survit à la purge d'un compte
  depose_par_libelle text       NOT NULL,
  CONSTRAINT gestion_piece_drive_ids_chk CHECK (btrim(drive_file_id) <> '' AND btrim(drive_dossier_id) <> ''),
  CONSTRAINT gestion_piece_drive_auteur_chk CHECK (btrim(depose_par_libelle) <> '')
);

-- L'ANTI-DOUBLON, tenu par la base : la même pièce ne part pas deux fois dans le même dossier.
CREATE UNIQUE INDEX IF NOT EXISTS gestion_piece_drive_unique_idx
  ON gestion_piece_drive (piece_id, drive_dossier_id);

-- « Cette pièce est-elle déjà dans le Drive ? » — la question que l'écran pose pour CHAQUE carte affichée.
CREATE INDEX IF NOT EXISTS gestion_piece_drive_piece_idx
  ON gestion_piece_drive (piece_id, depose_le DESC);

-- « Où avait-on déposé la dernière fois ? » — le sélecteur s'ouvre sur ce dossier-là.
CREATE INDEX IF NOT EXISTS gestion_piece_drive_recents_idx
  ON gestion_piece_drive (depose_le DESC);

COMMENT ON TABLE gestion_piece_drive IS
  'LOT 5-PJ-B — une pièce jointe COPIÉE dans un dossier existant du Google Drive. Ne décrit pas l''arborescence : '
  'celle-ci est construite à la main et n''est jamais modifiée par l''application. UNIQUE (piece_id, drive_dossier_id) '
  'empêche le doublon dans un même dossier ; le même fichier dans un AUTRE dossier reste permis.';
COMMENT ON COLUMN gestion_piece_drive.dossier_nom IS
  'Nom du dossier AU MOMENT DU DÉPÔT, recopié exprès. Renommé plus tard dans le Drive, la carte continue d''afficher '
  'où l''on avait déposé — ce qui s''est passé, pas ce qui est vrai aujourd''hui.';
COMMENT ON COLUMN gestion_piece_drive.web_view_link IS
  'Le SEUL lien montré au navigateur. Aucune URL de stockage de l''application ne sort jamais vers l''écran. '
  '⚠️ Il peut pointer vers un fichier déplacé ou supprimé depuis Google : nous ne surveillons pas le Drive.';

-- Un dépôt est un GESTE : il se journalise comme les autres. `piece_drive` rejoint donc la liste fermée des entités.
ALTER TABLE gestion_journal DROP CONSTRAINT IF EXISTS gestion_journal_entite_chk;
ALTER TABLE gestion_journal
  ADD CONSTRAINT gestion_journal_entite_chk
  CHECK (entite = ANY (ARRAY[
    'message', 'fil', 'evenement', 'affectation', 'regle', 'config', 'releve', 'partenaire',
    'envoi',        -- 243 : un courrier PARTI de chez nous
    'piece_drive'   -- 245 : une pièce jointe COPIÉE dans le Drive
  ]));

COMMIT;
