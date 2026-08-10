-- 089_dossier_document.sql — Module VEILLE PERMIS (chantier A1b) : documents AJOUTÉS À LA MAIN sur un permis archivé,
-- rattachés au DOSSIER, DISTINCTS des pièces reçues par e-mail (demande_reponse_piece, rattachées à la réponse). Requiert 077.
--
-- SÛR : DDL strictement ADDITIVE (CREATE TABLE/INDEX IF NOT EXISTS). Aucun DROP, aucun UPDATE, aucun trigger. N'écrit JAMAIS
-- demande.statut. Ne touche PAS demande_reponse_piece. GOLDEN-SAFE. Un seul BEGIN/COMMIT. Idempotente. TU NE L'APPLIQUES PAS.
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/089_dossier_document.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer.
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- dossier_document — un document déposé À LA MAIN sur un permis (dossier). `cle_stockage` est NOT NULL parce que le DÉPÔT S3
-- PRÉCÈDE l'insertion : jamais de ligne sans objet. Le nom d'origine (`nom_fichier`) est POUR L'AFFICHAGE seulement — il
-- n'entre jamais dans la clé de stockage (clé = dossiers/<dossier_id>/<uuid>.<ext>, non énumérable).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dossier_document (
  id                bigserial   PRIMARY KEY,
  dossier_id        bigint      NOT NULL REFERENCES sitadel_dossier(id) ON DELETE CASCADE,
  nom_fichier       text        NOT NULL,               -- nom d'origine, AFFICHAGE seulement (jamais dans la clé)
  type_mime         text,
  taille_octets     bigint,
  cle_stockage      text        NOT NULL,               -- clé S3 ; NOT NULL : le dépôt précède l'insertion (jamais de ligne sans objet)
  empreinte_sha256  text,
  depose_le         timestamptz NOT NULL DEFAULT now(),
  depose_par        text,
  note              text
);

COMMENT ON TABLE dossier_document IS
  'Documents AJOUTÉS À LA MAIN sur un permis archivé (dossier satisfait), rattachés au DOSSIER (dossier_id) — distincts des pièces REÇUES PAR E-MAIL (demande_reponse_piece, rattachées à la réponse). RÈGLE : ces documents manuels sont SUPPRIMABLES ; les pièces reçues par e-mail ne le sont JAMAIS (registre de ce que l''administration a communiqué). cle_stockage NOT NULL car le dépôt S3 précède l''insertion.';
COMMENT ON COLUMN dossier_document.nom_fichier IS 'Nom d''origine du fichier — AFFICHAGE seulement ; n''entre jamais dans la clé de stockage (UUID).';
COMMENT ON COLUMN dossier_document.cle_stockage IS 'Clé de l''objet S3 (dossiers/<dossier_id>/<uuid>.<ext>), NON énumérable. NOT NULL : déposé avant insertion.';

CREATE INDEX IF NOT EXISTS dossier_document_dossier_idx ON dossier_document (dossier_id);

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--   \d dossier_document
--   SELECT count(*) FROM dossier_document;                 -- 0 au départ
--   SELECT indexname FROM pg_indexes WHERE tablename = 'dossier_document';  -- dossier_document_dossier_idx présent
--   -- Contrôle NÉGATIF (doit ÉCHOUER), en transaction annulée :
--   -- BEGIN; INSERT INTO dossier_document (dossier_id, nom_fichier) VALUES (1, 'x'); ROLLBACK;  -- viole cle_stockage NOT NULL
