-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 288 — UNE COPIE DU REGISTRE A DISPARU DU DRIVE : L'APPLICATION NE DOIT PAS TRÉBUCHER
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- 🔴 ARNO (01/10/2026), à propos des fichiers « _MESURE » qu'il supprime lui-même dans Google Drive : « l'app ne
-- doit pas trébucher quand une copie de son registre a disparu du Drive (404 à la relecture de nom, au rangement
-- ou à l'aperçu) : marque la copie “disparue” dans le registre, cesse de la relire, utilise les autres copies, et
-- n'affiche jamais d'erreur à Arno pour ça. »
--
-- ═══ POURQUOI UNE COLONNE, ET PAS UNE SUPPRESSION DE LIGNE ══════════════════════════════════════════════════════
--
-- La ligne dit un FAIT DATÉ : « le JJ/MM, nous avons déposé une copie de cette pièce dans ce dossier ». Ce fait
-- reste vrai même si le fichier a été supprimé ensuite — et c'est justement lui qu'on veut pouvoir relire le jour
-- où quelqu'un demande « où est passé ce document ? ». L'effacer rendrait l'historique muet sur le seul épisode
-- qui méritait d'être raconté.
--
-- 🔴 ET C'EST LA MÊME RÈGLE QUE PARTOUT DANS CE MODULE : on marque, on n'efface pas (cf. migration 287 pour les
-- fiches de personnes). Une copie disparue est écartée des lectures, jamais du registre.
--
-- ⚠️ `disparu_motif` GARDE LE MOT DE GOOGLE, tronqué. « 404 » se comprend ; « 403 » (droits retirés) ne se répare
-- pas de la même façon, et les deux se ressemblent trop à l'écran pour qu'on les confonde dans le journal.
--
-- 🔒 AUCUNE DONNÉE N'EST TOUCHÉE : deux colonnes nulles ajoutées. Sans cette migration, la sonde
-- `copieDisparueDisponible` rend faux, aucune colonne n'est nommée, et le module se comporte exactement comme
-- avant ce lot — c'est-à-dire qu'un 404 reste silencieux, sans être mémorisé.
--
-- RÉVERSIBLE :
--   DROP INDEX IF EXISTS gestion_piece_drive_disparues_idx;
--   ALTER TABLE gestion_piece_drive DROP COLUMN disparu_le, DROP COLUMN disparu_motif;

ALTER TABLE gestion_piece_drive
  ADD COLUMN IF NOT EXISTS disparu_le    timestamptz,
  ADD COLUMN IF NOT EXISTS disparu_motif text;

-- ⚠️ INDEX PARTIEL, ET SEULEMENT SUR LES DISPARUES : elles sont rares, et TOUTES les lectures d'affichage les
--    écartent. Un index sur toute la colonne coûterait de l'écriture à chaque dépôt pour rien.
CREATE INDEX IF NOT EXISTS gestion_piece_drive_disparues_idx
  ON gestion_piece_drive (piece_id) WHERE disparu_le IS NOT NULL;

COMMENT ON COLUMN gestion_piece_drive.disparu_le IS
  'Le fichier n''existe plus dans le Drive (404), ou n''y est plus lisible. La ligne RESTE : elle raconte un '
  'dépôt qui a bien eu lieu. NULL = copie vivante. Les lectures d''affichage écartent les copies disparues.';
COMMENT ON COLUMN gestion_piece_drive.disparu_motif IS
  'Ce que Google a répondu, en clair et tronqué. « introuvable » et « droits insuffisants » ne se réparent pas '
  'de la même façon.';
