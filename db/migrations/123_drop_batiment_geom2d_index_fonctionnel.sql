-- 123_drop_batiment_geom2d_index_fonctionnel.sql — chantier #2c : SUPPRIMER l'index fonctionnel TEMPORAIRE batiment_geom2d_gix.
--
-- ⚠️ POURQUOI : batiment_geom2d_gix (créé en migration 122 / BDT-8) était une BÉQUILLE TEMPORAIRE. Plusieurs requêtes du moteur
-- enveloppaient b.geom dans ST_Force2D(...) DANS UN PRÉDICAT spatial (ST_Intersects / ST_Contains / <-> / ST_DWithin), ce qui
-- défaisait l'index GiST de base batiment_geom_geom_idx → seq scan complet. 122 (sur l'EXPRESSION ST_Force2D(geom)) les rattrapait.
-- Depuis, ces prédicats ont été DÉ-ENVELOPPÉS :
--   · chantier #2      (commit 010e732) : obstacles.ts:578 (ST_Intersects), :583 (ST_Contains), origine.ts:56 (KNN <->) ;
--   · chantier #2c-bis (committé)        : actionsRattachement.ts (importBdTopoSuivis), exportAltitudes.ts (exporterParParcelle),
--                                          et les 5 CLI *-check.ts.
-- Balayage dépôt (app/lib, app/scripts, app/api, db/) RE-VÉRIFIÉ avant ce drop : PLUS AUCUNE requête runtime n'enveloppe
-- ST_Force2D(batiment.geom) dans un prédicat. Les seules occurrences restantes sont sur d'AUTRES tables (parcs/eau, obstacles.ts:731/734)
-- ou dans le bloc EXPLAIN de la migration 122 elle-même — ni l'une ni l'autre ne dépend de cet index au runtime.
-- 122 n'a donc plus AUCUN dépendant, et coûte ~122 Mo + du temps de reconstruction à CHAQUE réimport BD TOPO. On le supprime.
--
-- 🔒 INVARIANT INTACT : ST_Force2D reste CONSERVÉ partout où il protège une DISTANCE (ST_Distance), un RASTER (ST_Value / ST_Intersects
-- sur m.rast, ST_PointOnSurface) ou une SORTIE (ST_AsText, ST_Union, projections). Ce drop ne touche AUCUNE de ces occurrences — il ne
-- supprime qu'un index désormais inutile. Ne touche NI le moteur, NI le golden, NI la vue bdtopo_batiment, NI pipeline.itest.ts.
--
-- SÛR : un seul DROP INDEX IF EXISTS, idempotent (re-run = no-op). Un seul BEGIN/COMMIT. Requiert batiment + l'index de base
-- batiment_geom_geom_idx (les prédicats nus s'appuient dessus). Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/123_drop_batiment_geom2d_index_fonctionnel.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS.
--
-- 🔴 APRÈS APPLICATION : jouer le GATE GOLDEN → npm run test:integration (29.107259068449615 attendu INCHANGÉ). Un index n'altère
-- aucun résultat ; c'est une vérification, pas un rescellage.

BEGIN;

-- Garde : ne droppe 122 que si l'index de base existe (les prédicats nus en dépendent).
DO $$
BEGIN
  IF to_regclass('public.batiment_geom_geom_idx') IS NULL THEN
    RAISE EXCEPTION 'batiment_geom_geom_idx (index de base) ABSENT : dropper 122 enverrait les prédicats nus en seq scan. Abandon.';
  END IF;
END $$;

DROP INDEX IF EXISTS batiment_geom2d_gix;

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (S'EXÉCUTE quand tu lances le fichier — PROUVE, ne suppose pas) :
\echo '>>> ① index de batiment (attendu EXACTEMENT 3 : batiment_cleabs_idx, batiment_geom_geom_idx, batiment_pkey ; plus de batiment_geom2d_gix) :'
SELECT indexname FROM pg_indexes WHERE tablename = 'batiment' ORDER BY indexname;
SELECT count(*) AS nb_index_batiment, (to_regclass('public.batiment_geom2d_gix') IS NULL) AS geom2d_gix_bien_supprime
FROM pg_indexes WHERE tablename = 'batiment';
\echo '>>> ② taille table + index après drop (le total a baissé de ~122 Mo) :'
SELECT pg_size_pretty(pg_total_relation_size('batiment')) AS total,
       pg_size_pretty(pg_relation_size('batiment'))       AS heap,
       pg_size_pretty(pg_indexes_size('batiment'))         AS index_total;
SELECT indexname, pg_size_pretty(pg_relation_size(indexname::regclass)) AS taille
FROM pg_indexes WHERE tablename = 'batiment' ORDER BY indexname;

\echo '>>> ③A faisceau obstaclesSurAxe (obstacles.ts:578 ST_Intersects + :583 NOT ST_Contains, MÊME requête) → Index Scan via batiment_geom_geom_idx, JAMAIS Seq Scan :'
EXPLAIN (ANALYZE, BUFFERS)
WITH o AS (SELECT ST_Transform(ST_SetSRID(ST_MakePoint(2.269431435588249,48.90693182287072),4326),2154) AS g),
couloir AS (SELECT o.g AS origine, ST_Buffer(ST_MakeLine(o.g, ST_Translate(o.g, 200*sin(radians(90)), 200*cos(radians(90)))), 1.0) AS corr FROM o)
SELECT b.id, ST_Distance(ST_Force2D(b.geom), c.origine) AS dist_m
FROM bdtopo_batiment b, couloir c
WHERE ST_Intersects(b.geom, c.corr) AND b.id <> -1 AND NOT ST_Contains(b.geom, c.origine)
ORDER BY dist_m ASC;

\echo '>>> ③B KNN validerOrigine (origine.ts:56) → Index Scan via batiment_geom_geom_idx :'
EXPLAIN (ANALYZE, BUFFERS)
WITH pt AS (SELECT ST_Transform(ST_SetSRID(ST_MakePoint(2.269431435588249,48.90693182287072),4326),2154) AS g)
SELECT b.id FROM bdtopo_batiment b, pt ORDER BY b.geom <-> pt.g LIMIT 1;

\echo '>>> ③C importBdTopoSuivis (actionsRattachement.ts) → batiment en Index Scan via batiment_geom_geom_idx :'
EXPLAIN (ANALYZE, BUFFERS)
SELECT DISTINCT b.cleabs, b.altitude_maximale_toit AS alt
  FROM batiment b
  JOIN permis_empreinte e ON e.geom IS NOT NULL AND ST_Intersects(b.geom, e.geom)
 WHERE b.cleabs IS NOT NULL;

\echo '>>> ③D exporterParParcelle (exportAltitudes.ts) → batiment en Index Scan via batiment_geom_geom_idx (idu pris au hasard) :'
EXPLAIN (ANALYZE, BUFFERS)
SELECT DISTINCT b.cleabs
  FROM batiment b
  JOIN permis_parcelle  p ON p.idu = (SELECT idu FROM permis_parcelle WHERE idu IS NOT NULL LIMIT 1)
  JOIN permis_empreinte e ON e.dossier_id = p.dossier_id AND e.geom IS NOT NULL
 WHERE b.cleabs IS NOT NULL AND ST_Intersects(b.geom, e.geom)
 ORDER BY b.cleabs;

\echo '>>> Si UNE de ③A–③D montre un Seq Scan sur batiment : le drop est prématuré → ROLLBACK ci-dessous.'

-- ═════════════════════════════════════════════════════════════════════════════
-- 🔙 ROLLBACK (une commande — recréation à l'identique de 122, ~3,86 s mesuré, ~122 Mo) :
--   psql "$DATABASE_URL" -c "CREATE INDEX IF NOT EXISTS batiment_geom2d_gix ON batiment USING gist (ST_Force2D(geom));"
-- (facultatif : recoller le COMMENT ON INDEX de la migration 122 si tu veux restaurer aussi sa documentation).
