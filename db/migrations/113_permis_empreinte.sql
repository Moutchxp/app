-- 113_permis_empreinte.sql — Module VEILLE PERMIS (chantier FUS-1) : figer l'état géométrique d'origine + empreinte attendue.
-- ⚠️ POURQUOI : à la fusion, les parcelles d'origine DISPARAISSENT du cadastre (nouveau numéro, nouveau contour). `cadastre:ingest`
-- fait DELETE+append → il ÉCRASE le millésime précédent : sans SNAPSHOT, la disparition est invisible. On ne va PAS historiser le
-- million de parcelles ; on ne fige QUE celles des permis suivis. Deux ajouts :
--  1) sur permis_parcelle : `geom_snapshot` (copie de parcelle.geom au moment de l'écriture) + `snapshot_millesime` (millésime cadastral
--     de cette copie) → l'état d'origine SURVIT au réimport du cadastre ;
--  2) table permis_empreinte (un permis = une ligne) : l'EMPREINTE ATTENDUE = ST_Union des géométries d'origine + sa surface. ⚠️ EMPREINTE
--     ATTENDUE, PAS prédiction : le projet peut n'occuper qu'une partie des parcelles, un arpentage peut redécouper, et le contour du
--     millésime suivant diffère toujours un peu. Ne jamais traiter cette géométrie comme la vraie parcelle future.
-- `complete` = toutes les parcelles d'origine étaient rattachées ; sinon `motif` dit pourquoi (jamais une union sur un sous-ensemble muet).
--
-- SÛR : DDL strictement ADDITIVE (ADD COLUMN / CREATE … IF NOT EXISTS). Aucun DROP, aucun UPDATE, aucune colonne existante touchée.
-- Idempotente. Un seul BEGIN/COMMIT. Requiert `permis_parcelle` (112) et `parcelle`. Application MANUELLE (Arno) :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/113_permis_empreinte.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS.

BEGIN;

-- 1) SNAPSHOT de la parcelle d'origine, figé sur permis_parcelle (survit au réimport du cadastre).
ALTER TABLE permis_parcelle
  ADD COLUMN IF NOT EXISTS geom_snapshot      geometry(MultiPolygon, 2154),   -- copie de parcelle.geom (Lambert-93)
  ADD COLUMN IF NOT EXISTS snapshot_millesime text;                            -- millésime cadastral de la copie (cadastre_millesime)
CREATE INDEX IF NOT EXISTS permis_parcelle_snapshot_gix ON permis_parcelle USING gist (geom_snapshot);

-- 2) EMPREINTE ATTENDUE du permis : union des géométries d'origine + surface. Un permis = une ligne.
CREATE TABLE IF NOT EXISTS permis_empreinte (
  dossier_id   bigint      PRIMARY KEY REFERENCES sitadel_dossier(id) ON DELETE CASCADE,
  geom         geometry(MultiPolygon, 2154),     -- ST_Union des geom_snapshot d'origine ; NULL si incomplète
  surface_m2   numeric,                           -- ST_Area(geom) ; NULL si incomplète
  nb_parcelles integer,                            -- nb de parcelles d'origine (union si complète, total sinon)
  complete     boolean     NOT NULL DEFAULT false, -- true = toutes les parcelles d'origine rattachées
  motif        text,                               -- si incomplète : pourquoi (ex. « 1 parcelle non rattachée »)
  millesime    text,                               -- millésime cadastral de l'union (le plus récent des snapshots)
  maj_le       timestamptz NOT NULL DEFAULT now(),
  maj_par      text
);
CREATE INDEX IF NOT EXISTS permis_empreinte_gix ON permis_empreinte USING gist (geom);

COMMENT ON COLUMN permis_parcelle.geom_snapshot IS 'FUS-1 — copie figée de parcelle.geom au moment de l''écriture (Lambert-93), pour survivre au réimport DELETE+append du cadastre. Base de la détection de fusion (FUS-2/3).';
COMMENT ON TABLE permis_empreinte IS 'FUS-1 — EMPREINTE ATTENDUE de la future parcelle fusionnée d''un permis = ST_Union des géométries d''origine. ⚠️ ATTENDUE, PAS prédiction : le projet peut n''occuper qu''une partie, un arpentage peut redécouper, le contour du millésime suivant diffère. `complete`=false + `motif` si une parcelle d''origine n''est pas rattachée (jamais d''union sur un sous-ensemble muet).';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (S'EXÉCUTE quand tu lances le fichier — AFFICHE le résultat) :
\echo '>>> colonnes snapshot sur permis_parcelle :'
SELECT column_name, udt_name FROM information_schema.columns WHERE table_name = 'permis_parcelle' AND column_name IN ('geom_snapshot','snapshot_millesime') ORDER BY column_name;
\echo '>>> table permis_empreinte :'
SELECT column_name, udt_name FROM information_schema.columns WHERE table_name = 'permis_empreinte' ORDER BY ordinal_position;
\echo '>>> index GiST (snapshot + empreinte) :'
SELECT indexname FROM pg_indexes WHERE indexname IN ('permis_parcelle_snapshot_gix','permis_empreinte_gix') ORDER BY indexname;
