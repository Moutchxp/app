-- 111_cadastre_millesime.sql — CAD-1 : traçabilité de l'ingestion cadastre + index de la clé cadastrale robuste.
-- ⚠️ POURQUOI : la table `parcelle` (couche PARCELLE etalab-cadastre / PCI) a été chargée HORS du système de migrations, sans trace
-- (ni script, ni millésime — recon CADASTRE). On corrige : (1) un index btree sur `parcelle.id` = l'IDU, la SEULE clé cadastrale
-- robuste (les colonnes parsées `section`/`numero` ont perdu leurs zéros de tête ; l'IDU les garde) ; (2) une table `cadastre_millesime`
-- qui journalise chaque chargement (source, département, millésime, date de livraison, nb de lignes, horodatage). L'unicité
-- (département, millésime) porte l'IDEMPOTENCE du script `cadastre:ingest` (un département déjà chargé au même millésime = ignoré).
--
-- REQUIERT que la table `parcelle` existe déjà (chargée par ogr2ogr). SÛR : DDL strictement ADDITIVE (CREATE … IF NOT EXISTS).
-- Aucun DROP, aucun UPDATE, aucune colonne existante touchée. Idempotente. Un seul BEGIN/COMMIT. Application MANUELLE (Arno) :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/111_cadastre_millesime.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS.

BEGIN;

-- 1) Index sur l'IDU (clé cadastrale robuste), pour un rapprochement par identifiant à grande échelle (≥ 900 000 lignes à venir).
CREATE INDEX IF NOT EXISTS parcelle_id_idx ON parcelle (id);

-- 2) Millésime d'ingestion : un (département, millésime) = une ligne. UNIQUE → idempotence du script d'ingestion.
CREATE TABLE IF NOT EXISTS cadastre_millesime (
  id              serial      PRIMARY KEY,
  source          text        NOT NULL,           -- ex. 'etalab-cadastre (cadastre.data.gouv.fr) — couche parcelles SHP Lambert-93'
  departement     char(2)     NOT NULL,           -- '75', '92', '93', '78'
  millesime       text        NOT NULL,           -- dossier daté de la source (ex. '2026-06-01')
  livraison       text,                           -- Last-Modified du fichier téléchargé (date de livraison réelle), best-effort
  lignes_chargees bigint,                          -- nb de parcelles chargées pour ce département
  charge_le       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (departement, millesime)
);

COMMENT ON TABLE cadastre_millesime IS 'CAD-1 — journal des ingestions de la table parcelle (couche PARCELLE etalab-cadastre / PCI Parcellaire Express). Un (département, millésime) = une ligne ; UNIQUE(département, millésime) porte l''idempotence du script cadastre:ingest.';
COMMENT ON COLUMN cadastre_millesime.millesime IS 'Dossier daté de la source (ex. 2026-06-01), tel qu''il figure dans l''URL cadastre.data.gouv.fr/data/etalab-cadastre/<millesime>/…';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (S'EXÉCUTE quand tu lances le fichier — AFFICHE le résultat) :
\echo '>>> index parcelle_id_idx présent :'
SELECT indexname FROM pg_indexes WHERE tablename = 'parcelle' AND indexname = 'parcelle_id_idx';
\echo '>>> table cadastre_millesime (colonnes) :'
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'cadastre_millesime' ORDER BY ordinal_position;
\echo '>>> contrainte d''unicité (département, millésime) :'
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'cadastre_millesime'::regclass AND contype = 'u';
