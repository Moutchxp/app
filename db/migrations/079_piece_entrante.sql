-- 079_piece_entrante.sql — Module VEILLE PERMIS (chantier R4) : DÉPÔT des pièces jointes ENTRANTES.
-- ⚠️ Le contenu des pièces vient d'un TIERS NON FIABLE : il est stocké TEL QUEL sur l'object storage (jamais en base, jamais
-- ouvert/parsé — extraction = R9). Cette migration n'ajoute QUE des réglages/compteurs : le stockage lui-même est du code.
-- Les colonnes de demande_reponse_piece (cle_stockage, taille_octets, empreinte_sha256, stocke_le, motif_non_stocke)
-- EXISTENT DÉJÀ depuis la 073 — on ne les recrée pas. N'écrit JAMAIS demande.statut. TU NE L'APPLIQUES PAS. Requiert 078.
--
-- SÛR : DDL ADDITIVE (ADD COLUMN IF NOT EXISTS). Aucun DROP, aucun trigger. GOLDEN-SAFE. Un seul BEGIN/COMMIT. Idempotente.
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/079_piece_entrante.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer.
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) config_veille : borne de taille des pièces entrantes (Mo), éditable depuis l'écran Réglages. Distincte de la borne
--    S3_TAILLE_MAX_MO du chemin internaute (photos/certificats) : les pièces d'urbanisme peuvent être bien plus lourdes.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS piece_taille_max_mo integer NOT NULL DEFAULT 50
  CHECK (piece_taille_max_mo BETWEEN 1 AND 200);

COMMENT ON COLUMN config_veille.piece_taille_max_mo IS 'Taille maximale (Mo) d''une pièce jointe entrante déposée. Au-delà, la pièce n''est pas stockée mais sa trace (métadonnées + motif) est conservée.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) releve_run : compteurs de pièces déposées / non déposées, pour que ce soit visible sans requête SQL (écran + journal).
--    NULL pour les runs antérieurs à cette migration (aucune rétro-action).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE releve_run ADD COLUMN IF NOT EXISTS pieces_deposees integer;
ALTER TABLE releve_run ADD COLUMN IF NOT EXISTS pieces_non_deposees integer;

COMMENT ON COLUMN releve_run.pieces_deposees IS 'Nombre de pièces jointes réellement déposées sur l''object storage pendant ce run.';
COMMENT ON COLUMN releve_run.pieces_non_deposees IS 'Nombre de pièces NON déposées (type refusé, trop volumineuses, stockage indisponible…) — trace conservée avec motif.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--
--   SELECT piece_taille_max_mo FROM config_veille WHERE id = 1;
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'config_veille'::regclass AND conname LIKE '%piece_taille%';
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'releve_run' AND column_name IN ('pieces_deposees','pieces_non_deposees');
--
--   -- Contrôles NÉGATIFs (doivent ÉCHOUER), en transaction annulée :
--   -- BEGIN; UPDATE config_veille SET piece_taille_max_mo = 0 WHERE id = 1; ROLLBACK;   -- viole le CHECK (min 1)
--   -- BEGIN; UPDATE config_veille SET piece_taille_max_mo = 201 WHERE id = 1; ROLLBACK; -- viole le CHECK (max 200)
