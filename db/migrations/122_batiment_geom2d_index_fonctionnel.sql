-- 122_batiment_geom2d_index_fonctionnel.sql — chantier BDT-8 : INDEX GiST FONCTIONNEL sur ST_Force2D(geom) de batiment.
--
-- ⚠️ POURQUOI (diagnostic BDT-7) : plusieurs requêtes du moteur ENVELOPPENT `b.geom` dans `ST_Force2D(...)` dans leur prédicat
-- spatial (ST_Intersects / KNN <->). Or l'index GiST de base (batiment_geom_geom_idx) est sur `geom` BRUT → une expression
-- `ST_Force2D(geom)` ne le matche pas → le planificateur tombe en SEQ SCAN de toute la table, RÉPÉTÉ jusqu'à 61× par analyse
-- (score d'amplitude). Mesuré : la requête faisceau seule = Parallel Seq Scan, 1036 ms (Juin 3,07 M) contre 1,3 ms pour la
-- version NON enveloppée qui, elle, utilise l'index (Index Scan, 43 pages). Résultat produit : une analyse d'adresse est passée
-- de ~11 s à ~33 s côté internaute.
--
-- CE QUE FAIT CET INDEX : posé sur l'EXPRESSION `ST_Force2D(geom)`, il matche EXACTEMENT les prédicats enveloppés du moteur
-- → ils repassent en Index Scan SANS toucher une ligne de code moteur (chantier #2 séparé). Ne change AUCUN résultat (un index
-- n'altère que la vitesse) → golden-safe.
--
-- 🔴 TEMPORAIRE — À DROPPER en fin de chantier #2 : quand le moteur cessera d'envelopper ses prédicats (`ST_Intersects(b.geom,…)`
-- non enveloppé, comme le fait déjà echantillonnerGrille), l'index de base batiment_geom_geom_idx suffira et CET index fonctionnel
-- deviendra un doublon inutile (~coût de stockage + maintenance). Le supprimer alors : DROP INDEX IF EXISTS batiment_geom2d_gix;
--
-- IMMUTABILITÉ : ST_Force2D est IMMUTABLE STRICT en PostGIS (nécessaire ET suffisant pour un index sur expression). Si elle ne
-- l'était pas, le CREATE INDEX ci-dessous ÉCHOUERAIT — l'application réussie est donc une preuve. Le bloc de vérif le confirme.
--
-- SÛR : DDL strictement ADDITIVE (CREATE INDEX … IF NOT EXISTS). Aucun index existant supprimé/modifié. Ne touche NI le moteur, NI
-- le golden, NI la vue bdtopo_batiment, NI pipeline.itest.ts. `CREATE INDEX` (non CONCURRENTLY) prend un verrou SHARE : il bloque
-- les écritures MAIS autorise les LECTURES → l'app continue de lire batiment pendant la construction (et batiment n'a aucun
-- écrivain au runtime : table de référence). Idempotente. Un seul BEGIN/COMMIT. Requiert batiment + PostGIS. Application MANUELLE
-- (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/122_batiment_geom2d_index_fonctionnel.sql
-- ⚠️ COÛT D'APPLICATION (projeté BDT-7) : ~200–300 Mo, ~2–5 min de build (GiST sur ~3,07 M géométries). Le bloc de vérif affiche
-- les CHIFFRES RÉELS (\timing on → durée du CREATE INDEX ; pg_size_pretty → taille). DRY-RUN : COMMIT → ROLLBACK. TU NE L'APPLIQUES PAS.

\timing on

BEGIN;

CREATE INDEX IF NOT EXISTS batiment_geom2d_gix ON batiment USING gist (ST_Force2D(geom));

COMMENT ON INDEX batiment_geom2d_gix IS
  'BDT-8 — index GiST FONCTIONNEL sur ST_Force2D(geom). Accélère les prédicats spatiaux du moteur qui enveloppent ST_Force2D(b.geom) et qui, sans lui, font un seq scan complet (validerOrigine KNN, obstaclesSurAxe faisceau ×61, candidatReentreeOrigine). 🔴 TEMPORAIRE : à DROPPER (DROP INDEX IF EXISTS batiment_geom2d_gix) en fin de chantier #2, quand le moteur n''enveloppera plus ses prédicats et que l''index de base batiment_geom_geom_idx (sur geom brut) suffira. NB : ne couvre PAS profilOrigineAxe, dont le prédicat enveloppe DIFFÉREMMENT (ST_Boundary(ST_Force2D(geom))).';

COMMIT;

\timing off

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (S'EXÉCUTE quand tu lances le fichier — PROUVE le gain, ne le suppose pas) :
\echo '>>> [2] ST_Force2D EST-il IMMUTABLE ? (provolatile doit valoir « i » ; sinon l''index eût été impossible) :'
SELECT proname, provolatile FROM pg_proc WHERE proname IN ('st_force2d','st_force_2d') ORDER BY proname;
\echo '>>> [4] TAILLE RÉELLE de l''index (projeté : 200–300 Mo) :'
SELECT indexname, pg_size_pretty(pg_relation_size(indexname::regclass)) AS taille
FROM pg_indexes WHERE indexname = 'batiment_geom2d_gix';

\echo '>>> [3] APRÈS — requête FAISCEAU : plan attendu = Index Scan sur batiment_geom2d_gix, peu de pages lues :'
EXPLAIN (ANALYZE, BUFFERS)
WITH o AS (SELECT ST_Transform(ST_SetSRID(ST_MakePoint(2.269431435588249,48.90693182287072),4326),2154) AS g),
couloir AS (SELECT o.g AS origine, ST_Buffer(ST_MakeLine(o.g, ST_Translate(o.g, 200*sin(radians(90)), 200*cos(radians(90)))), 1.0) AS corr FROM o)
SELECT b.id, ST_Distance(ST_Force2D(b.geom), c.origine) AS dist_m
FROM bdtopo_batiment b, couloir c
WHERE ST_Intersects(ST_Force2D(b.geom), c.corr) AND b.id <> -1 AND NOT ST_Contains(ST_Force2D(b.geom), c.origine)
ORDER BY dist_m ASC;

\echo '>>> [3] AVANT (comparaison) — index désactivé de force → on retrouve le Parallel Seq Scan (~190 000 pages, ~1000 ms) :'
BEGIN;
SET LOCAL enable_indexscan = off;
SET LOCAL enable_bitmapscan = off;
EXPLAIN (ANALYZE, BUFFERS)
WITH o AS (SELECT ST_Transform(ST_SetSRID(ST_MakePoint(2.269431435588249,48.90693182287072),4326),2154) AS g),
couloir AS (SELECT o.g AS origine, ST_Buffer(ST_MakeLine(o.g, ST_Translate(o.g, 200*sin(radians(90)), 200*cos(radians(90)))), 1.0) AS corr FROM o)
SELECT b.id, ST_Distance(ST_Force2D(b.geom), c.origine) AS dist_m
FROM bdtopo_batiment b, couloir c
WHERE ST_Intersects(ST_Force2D(b.geom), c.corr) AND b.id <> -1 AND NOT ST_Contains(ST_Force2D(b.geom), c.origine)
ORDER BY dist_m ASC;
ROLLBACK;

\echo '>>> [3-bis] APRÈS — KNN validerOrigine : doit aussi passer en Index Scan (KNN GiST sur l''expression) :'
EXPLAIN (ANALYZE, BUFFERS)
WITH pt AS (SELECT ST_Transform(ST_SetSRID(ST_MakePoint(2.269431435588249,48.90693182287072),4326),2154) AS g)
SELECT b.id FROM bdtopo_batiment b, pt ORDER BY ST_Force2D(b.geom) <-> pt.g LIMIT 1;

\echo '>>> RAPPEL : profilOrigineAxe (ST_Boundary(ST_Force2D(geom))) NE bénéficie PAS de cet index → reste pour le chantier #2.'
