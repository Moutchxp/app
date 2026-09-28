-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 269 — LES PIÈCES ET LES DOSSIERS RÉCEMMENT UTILISÉS (lot EDITEUR-PJ, 28/09/2026)
--
-- ═══ CE QU'ON NE POUVAIT PAS RETROUVER ══════════════════════════════════════════════════════════════════════════
-- Joindre une pièce, c'est presque toujours rejoindre la même : le bail d'un lot, le devis d'un artisan, un modèle
-- de courrier. Or le sélecteur Drive rouvrait chaque fois « Mon Drive », à treize niveaux du dossier voulu, et le
-- sélecteur de fichiers du Mac n'offre rien non plus : un navigateur n'a PAS accès à l'historique du disque, et
-- c'est une protection, pas un manque — une page web qui saurait quels fichiers vous avez ouverts en saurait trop.
--
-- ⇒ On tient donc NOTRE propre historique : ce qu'Arno a réellement joint depuis notre application.
--
-- ═══ 🔴 RIEN N'EST ÉCRIT DANS LE DRIVE POUR CELA ════════════════════════════════════════════════════════════════
-- Pas un fichier, pas un dossier, pas une propriété, pas un raccourci. Le Drive reste en LECTURE SEULE, exactement
-- comme avant : l'historique vit ICI, dans notre base, et il ne connaît du Drive que des identifiants publics que
-- l'on redemandera par les routes ordinaires — lesquelles revérifient les droits à chaque lecture.
--
-- ═══ 🔴 POURQUOI PAR PERSONNE, ET PAS PAR CABINET ═══════════════════════════════════════════════════════════════
-- « Les derniers fichiers qu'ARNO a joints ». Un historique partagé mélangerait le travail de chacun et proposerait
-- en tête des pièces qu'on n'a jamais ouvertes. Et il contournerait les droits Drive : voir dans MA liste le nom
-- d'un fichier auquel je n'ai pas accès est déjà une fuite, même sans pouvoir l'ouvrir.
--
-- ═══ 🔴 UNE LIGNE PAR CIBLE, PAS UN JOURNAL ═════════════════════════════════════════════════════════════════════
-- On ne garde pas chaque usage : on garde la CIBLE, avec la date du dernier usage. Un journal ferait une liste de
-- « Récents » où le même bail apparaîtrait douze fois de suite — c'est-à-dire une liste inutilisable. D'où l'index
-- UNIQUE : rejoindre le même fichier remonte sa ligne, il n'en crée pas une seconde.
--
-- ⚠️ MIGRATION LIVRÉE NON APPLIQUÉE. Le code tourne sans elle : la sonde `piecesRecentesDisponibles()`
--    (`app/lib/gestion/schema.ts`) ne nomme la table nulle part tant qu'elle n'existe pas. La section « Récents »
--    ne s'affiche alors PAS — ni dans le Drive, ni sous « Joindre un fichier » — et tout le reste est exactement
--    ce qu'il était : navigation Drive dossier par dossier, sélecteur de fichiers du Mac.
--
--    Pour l'appliquer :  psql -d sansvisavis -f db/migrations/269_gestion_pieces_recentes.sql
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS gestion_piece_recente (
  id            bigserial PRIMARY KEY,
  -- 🔴 L'HISTORIQUE EST CELUI D'UNE PERSONNE. `ON DELETE CASCADE` : un compte supprimé emporte son historique.
  compte_id     bigint      NOT NULL REFERENCES admin_utilisateur(id) ON DELETE CASCADE,
  -- 'drive_fichier' | 'drive_dossier' | 'locale'. Trois listes distinctes, jamais mélangées à l'écran : on ne
  --   rejoint pas un dossier comme on rejoint un fichier.
  sorte         text        NOT NULL,
  /**
   * LA CIBLE. Pour le Drive, son identifiant Google — public, et qui ne donne AUCUN droit par lui-même : toute
   * relecture repasse par nos routes, qui revérifient. Pour une pièce locale, la clé de stockage de la pièce
   * DÉJÀ déposée chez nous : c'est ainsi qu'on peut la rejoindre sans redemander le fichier au Mac.
   */
  cle           text        NOT NULL,
  -- Le nom lisible, FIGÉ : un identifiant seul ne dit rien, et un fichier renommé chez Google ne doit pas rendre
  --   la ligne muette. Le nom sera rafraîchi au prochain usage.
  libelle       text        NOT NULL DEFAULT '',
  -- Le type MIME d'une pièce, ou le chemin lisible d'un dossier. Sert à l'affichage, jamais à une décision.
  detail        text,
  taille_octets bigint,
  premier_le    timestamptz NOT NULL DEFAULT now(),
  -- 🔴 LA CLÉ DE TRI : « le plus récent est en premier » (demande d'Arno).
  dernier_le    timestamptz NOT NULL DEFAULT now(),
  nb_usages     integer     NOT NULL DEFAULT 1,
  CONSTRAINT gestion_piece_recente_sorte_chk
    CHECK (sorte = ANY (ARRAY['drive_fichier', 'drive_dossier', 'locale'])),
  CONSTRAINT gestion_piece_recente_cle_chk CHECK (btrim(cle) <> '')
);

COMMENT ON TABLE gestion_piece_recente IS
  'Ce qu''une personne a réellement joint à un mail depuis notre application : fichiers Drive, dossiers Drive où '
  'elle a pris une pièce, et pièces venues de son ordinateur (par leur clé de stockage). Sert à proposer des '
  '« Récents ». RIEN n''est écrit dans le Drive pour tenir cette liste, et aucun droit n''en découle : toute '
  'relecture repasse par les routes ordinaires, qui revérifient.';

-- 🔴 UNE LIGNE PAR CIBLE : rejoindre le même fichier REMONTE sa ligne (voir `noterRecent`), il n'en crée pas une
--    seconde. Sans cet index, la liste des « Récents » afficherait douze fois le même bail.
CREATE UNIQUE INDEX IF NOT EXISTS gestion_piece_recente_cible_idx
  ON gestion_piece_recente (compte_id, sorte, cle);

-- La lecture de l'écran : « les N dernières cibles de cette sorte, pour cette personne ».
CREATE INDEX IF NOT EXISTS gestion_piece_recente_ordre_idx
  ON gestion_piece_recente (compte_id, sorte, dernier_le DESC);

COMMIT;
