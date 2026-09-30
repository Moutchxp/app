-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 286 — LOT NOM-UNIQUE-DES-PIECES : UN SEUL NOM PAR PIÈCE, DANS LE MAIL COMME DANS LE DRIVE
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- 🔴 ARNO : « une pièce jointe ne doit avoir qu'un seul nom, qu'elle soit dans un mail ou dans le Drive ».
--
-- 🔴 CE QUI EXISTAIT, ET POURQUOI ÇA NE SUFFISAIT PAS. `gestion_piece_drive.nom_depose` (migration 280) garde le
-- nom donné À UNE COPIE, au moment de la ranger. Une pièce rangée dans deux dossiers pouvait donc porter deux
-- noms, et le mail en gardait un troisième — celui du correspondant. Le nom appartenait au DÉPÔT ; il appartient
-- désormais à la PIÈCE.
--
-- ═══ LES DEUX COLONNES, ET CE QU'ELLES SÉPARENT ═════════════════════════════════════════════════════════════════
--
-- · `nom_fichier` (déjà là) devient le NOM D'ORIGINE, en LECTURE SEULE : celui sous lequel le correspondant l'a
--   envoyée. On ne le réécrit jamais — c'est lui qu'on cherchera dans Gmail, et Gmail ne permet de toute façon pas
--   de le changer.
-- · `nom_usage` (neuf) est le nom AFFICHÉ et ENVOYÉ partout.
--
-- ⚠️ `NULL` VEUT DIRE « LE NOM D'ORIGINE », et c'est délibéré : aucun remplissage des 27 000 lignes existantes,
-- aucune écriture sur des données qui n'ont pas changé, et la lecture retombe sur `nom_fichier` par un `coalesce`.
-- Écrire la valeur partout aurait coûté une réécriture complète de la table pour n'ajouter aucune information.
--
-- ═══ LE JOURNAL ═════════════════════════════════════════════════════════════════════════════════════════════════
--
-- Arno : « Journal de chaque renommage : qui, quand, ancien et nouveau nom, ids Drive touchés. » Une table à part,
-- append-only : un renommage est un GESTE, et un geste se raconte. `source` distingue ce qui vient de l'application
-- de ce qui vient d'un renommage fait à la main dans Google Drive et repris par la relève.
--
-- 🔒 AUCUNE DONNÉE N'EST TOUCHÉE : une colonne nulle ajoutée, une table créée vide. Sans cette migration, la sonde
-- `nomUsageDisponible` rend faux, aucune colonne n'est nommée, et le stylo garde EXACTEMENT son comportement
-- actuel (renommer la copie au moment de la ranger).
--
-- RÉVERSIBLE : DROP TABLE gestion_piece_renommage; ALTER TABLE gestion_piece DROP COLUMN nom_usage;

ALTER TABLE gestion_piece
  ADD COLUMN IF NOT EXISTS nom_usage text;

COMMENT ON COLUMN gestion_piece.nom_usage IS
  'LOT NOM-UNIQUE-DES-PIECES — le nom AFFICHÉ et ENVOYÉ partout. NULL = le nom d''origine (nom_fichier), qui '
  'reste en lecture seule. Le renommage met cette colonne à jour, puis aligne les copies Drive faites par l''app.';

-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 🔴🔴 LE NOM QUE L'APPLICATION A ÉCRIT DANS LE DRIVE — CORRECTION VENUE DE L'ÉPREUVE RÉELLE
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- PREMIÈRE VERSION DE LA REPRISE : « si le nom dans Drive diffère du nom d'usage, quelqu'un l'a renommé ». Éprouvé
-- en vrai le 30/09/2026, et RÉFUTÉ immédiatement : la passe a « repris » 60 pièces sur 60.
--
-- 🔴 LA CAUSE : les copies de « 00 Arrivée des mails » ne portent PAS le nom de la pièce. La copie les nomme
-- « 2026-09-23 — expediteur@exemple.fr — Facture.pdf », exprès, pour qu'un dossier d'arrivée se lise. Le nom Drive
-- diffère donc du nom d'usage pour les 26 522 copies, et la comparaison « différent ⇒ renommé » était vraie
-- partout. Elle aurait renommé toute la base d'après ses préfixes.
--
-- 🔴 CE QUI LA REMPLACE : on garde le nom que l'APPLICATION a écrit sur ce fichier. Un renommage humain se
-- reconnaît alors à ce que Drive dit autre chose que CE nom-là — pas autre chose que le nom de la pièce.
--
-- ⚠️ `NULL` VEUT DIRE « ON NE SAIT PAS CE QU'ON Y A ÉCRIT », et c'est le cas des 26 522 copies existantes : la
-- reprise les LAISSE alors tranquilles. Ne pas savoir n'est pas une raison de renommer — c'est exactement la
-- raison de ne pas le faire. La colonne se remplit au premier renommage fait depuis l'application.

ALTER TABLE gestion_piece_drive
  ADD COLUMN IF NOT EXISTS nom_drive text;

COMMENT ON COLUMN gestion_piece_drive.nom_drive IS
  'LOT NOM-UNIQUE-DES-PIECES — le nom que l''APPLICATION a écrit sur ce fichier Drive. NULL = jamais écrit par '
  'nous : la reprise depuis Drive ne touche alors pas à cette copie. Un renommage humain se reconnaît à ce que '
  'Drive dise autre chose que cette valeur.';

CREATE TABLE IF NOT EXISTS gestion_piece_renommage (
  id              bigserial PRIMARY KEY,
  piece_id        bigint      NOT NULL REFERENCES gestion_piece(id) ON DELETE CASCADE,
  ancien_nom      text        NOT NULL,
  nouveau_nom     text        NOT NULL,
  -- 🔴 D'OÙ VIENT LE RENOMMAGE : 'app' (quelqu'un a cliqué le stylo) ou 'drive' (le fichier a été renommé à la
  --    main dans Google Drive, et la relève l'a repris). Les deux sont des faits, et ils ne se racontent pas
  --    pareil — « renommé dans Google Drive » doit se lire tel quel dans l'historique.
  source          text        NOT NULL CHECK (source IN ('app', 'drive')),
  -- Les identifiants Drive effectivement renommés, et ceux qui ont été refusés avec leur motif.
  -- ⚠️ `jsonb` ET NON UNE TABLE DE LIAISON : c'est une TRACE, jamais une donnée qu'on interroge. Une table de plus
  --    obligerait à la joindre pour lire une ligne de journal, et personne ne cherche « tous les renommages qui
  --    ont touché tel fichier Drive ».
  ids_drive       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  refus           jsonb       NOT NULL DEFAULT '[]'::jsonb,
  par             integer,
  par_libelle     text        NOT NULL,
  le              timestamptz NOT NULL DEFAULT now()
);

-- Le journal se lit PAR PIÈCE, du plus récent au plus ancien : c'est la seule question qu'on lui pose.
CREATE INDEX IF NOT EXISTS gestion_piece_renommage_piece_idx
  ON gestion_piece_renommage (piece_id, le DESC);

COMMENT ON TABLE gestion_piece_renommage IS
  'LOT NOM-UNIQUE-DES-PIECES — journal APPEND-ONLY des renommages de pièces. Qui, quand, ancien et nouveau nom, '
  'identifiants Drive touchés, et refus motivés. Rien n''y est jamais modifié ni supprimé.';
