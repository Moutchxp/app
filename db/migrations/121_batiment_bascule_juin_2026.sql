-- 121_batiment_bascule_juin_2026.sql — chantier BDT-4b : BASCULER `batiment` sur l'édition HOMOGÈNE 2026-06-15, en traitant le
-- PIÈGE DE LA VUE et TOUS les objets dépendants que le rename ne suit pas, puis VÉRIFIER le golden (gate). Swap one-shot, atomique.
--
-- ÉTAT PRÉALABLE (BDT-4a terminé) : batiment_2026_06_15 = 3 075 383 objets uniques (5 166 644 livrés − 2 091 261 collisions),
-- index construits. batiment porte encore l'édition D092 de mars (697 886 objets). Filigrane batiment_edition_fige intact.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗
-- ║ 🔴 CE QUE `ALTER TABLE … RENAME` NE SUIT PAS (objets schéma-scoped → collision de nom si on réutilise le nom canonique) :  ║
-- ║   · les INDEX (batiment_pkey, batiment_geom_geom_idx, batiment_cleabs_idx) → renommés explicitement, l'ancien AVANT le neuf ║
-- ║   · la SÉQUENCE batiment_fid_seq → RENOMMÉE AVANT de libérer le nom (c'était le bug v1 : ERROR relation already exists) ;   ║
-- ║   · la contrainte PK → via RENAME CONSTRAINT (renomme contrainte + son index d'un coup) ; repli ALTER INDEX si index simple.║
-- ║ Suivent AUTOMATIQUEMENT (aucune action) : le DEFAULT nextval(…) (référence la séquence par OID, pas par nom) ; les TRIGGERS ║
-- ║ (attachés à la table par OID) ; il n'existe AUCUNE FK vers batiment (cleabs non unique). Tous vérifiés dans le bloc final.  ║
-- ║ 🔴 PIÈGE DE LA VUE : une vue référence sa table par OID, pas par nom. Après le double rename, bdtopo_batiment lirait MARS   ║
-- ║ en silence → PARADE : CREATE OR REPLACE VIEW … FROM batiment APRÈS les renames re-résout vers le NOUVEL OID.               ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝
--
-- SÛR : tout dans UNE transaction (BEGIN/COMMIT). NE DROPPE AUCUNE table (batiment_2026_03_15 = filet de retour ;
-- batiment_edition_fige = preuve de mars). Ne touche NI le moteur de verdict, NI pipeline.itest.ts. ATOMIQUE → REJOUABLE après un
-- échec : un ROLLBACK laisse la base à l'état d'origine (renames tous gardés IF EXISTS / DO-block, aucun état intermédiaire ne
-- subsiste). Requiert BDT-4a (batiment_2026_06_15) et 120 (bdtopo_edition). Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/121_batiment_bascule_juin_2026.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS.
--
-- 🔴 GATE GOLDEN (À FAIRE APRÈS APPLICATION, hors de ce fichier) :
--   npm run test:integration    (ou : npx vitest run --config vitest.integration.config.ts app/lib/db/pipeline.itest.ts)
--   · golden VERT (29.107259068449615 inchangé) → parfait, aucun rescellage, on continue.
--   · golden ROUGE → ARRÊTER. NE PAS rescelller, NE PAS modifier pipeline.itest.ts. Rollback (pied de fichier), puis remonter
--     l'écart + son origine à Arno : le rescellage est SA décision, en commit séparé.

BEGIN;

-- 0) GARDES : ne basculer que si la table juin existe et paraît complète (refus propre après un swap déjà réussi : la juin a alors
--    disparu → RAISE, transaction annulée, base intacte).
DO $$
BEGIN
  IF to_regclass('public.batiment')            IS NULL THEN RAISE EXCEPTION 'batiment absente'; END IF;
  IF to_regclass('public.batiment_2026_06_15') IS NULL THEN RAISE EXCEPTION 'batiment_2026_06_15 absente : lancer BDT-4a d''abord'; END IF;
  IF (SELECT count(*) FROM batiment_2026_06_15) < 1000000 THEN RAISE EXCEPTION 'batiment_2026_06_15 incomplète (< 1M lignes) : vérifier BDT-4a'; END IF;
END $$;

-- 1) ANCIEN batiment (mars) -> batiment_2026_03_15, puis LIBÉRER tous les noms canoniques schéma-scoped (index + SÉQUENCE).
ALTER TABLE IF EXISTS batiment RENAME TO batiment_2026_03_15;
-- 1a) PK : renomme contrainte + index d'un coup (RENAME CONSTRAINT) ; repli ALTER INDEX si c'est un index simple sans contrainte.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'batiment_2026_03_15'::regclass AND conname = 'batiment_pkey') THEN
    ALTER TABLE batiment_2026_03_15 RENAME CONSTRAINT batiment_pkey TO batiment_2026_03_15_pkey;
  ELSIF to_regclass('public.batiment_pkey') IS NOT NULL THEN
    ALTER INDEX batiment_pkey RENAME TO batiment_2026_03_15_pkey;
  END IF;
END $$;
-- 1b) index simples.
ALTER INDEX IF EXISTS batiment_geom_geom_idx RENAME TO batiment_2026_03_15_geom_geom_idx;
ALTER INDEX IF EXISTS batiment_cleabs_idx    RENAME TO batiment_2026_03_15_cleabs_idx;
-- 1c) 🔴 SÉQUENCE (LE BUG v1) : libérer batiment_fid_seq AVANT de le réutiliser pour juin.
ALTER SEQUENCE IF EXISTS batiment_fid_seq RENAME TO batiment_2026_03_15_fid_seq;

-- 2) NOUVELLE table (juin) -> batiment, puis REPRENDRE les noms canoniques (dont batiment_cleabs_idx, exigé sur la nouvelle table).
ALTER TABLE IF EXISTS batiment_2026_06_15 RENAME TO batiment;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'batiment'::regclass AND conname = 'batiment_2026_06_15_pkey') THEN
    ALTER TABLE batiment RENAME CONSTRAINT batiment_2026_06_15_pkey TO batiment_pkey;
  ELSIF to_regclass('public.batiment_2026_06_15_pkey') IS NOT NULL THEN
    ALTER INDEX batiment_2026_06_15_pkey RENAME TO batiment_pkey;
  END IF;
END $$;
ALTER INDEX IF EXISTS batiment_2026_06_15_geom_geom_idx RENAME TO batiment_geom_geom_idx;
ALTER INDEX IF EXISTS batiment_2026_06_15_cleabs_idx    RENAME TO batiment_cleabs_idx;
ALTER SEQUENCE IF EXISTS batiment_2026_06_15_fid_seq RENAME TO batiment_fid_seq;

-- 3) 🔴 PARADE AU PIÈGE DE LA VUE : recréer À L'IDENTIQUE (déf. de la migration 002) pour relier au NOUVEL OID de batiment.
CREATE OR REPLACE VIEW bdtopo_batiment AS
  SELECT fid AS id, cleabs, geom, hauteur, altitude_minimale_sol, altitude_maximale_toit,
         altitude_minimale_toit, nombre_d_etages, nature, usage_1, usage_2
  FROM batiment;

-- 4) MILLÉSIME COURANT : mars (et tout le reste) -> false, puis juin D092 -> true (successeur du D092-mars ; les 6 lignes juin ont
--    le même millésime '2026-06-15' → FUS-3f lira '2026-06-15' de toute façon ; colonne UNIQUE via l'index partiel de la 120).
UPDATE bdtopo_edition SET courante = false WHERE courante;
UPDATE bdtopo_edition SET courante = true  WHERE millesime = '2026-06-15' AND departement = 'D092';

-- 5) JOURNAL : la bascule est tracée (jamais un changement d'édition anonyme).
INSERT INTO import_log (table_cible, source, emprise, nb_objets)
SELECT 'batiment', 'BASCULE BDT-4b : batiment <- édition 2026-06-15 (6 dép.) ; ancien mars conservé en batiment_2026_03_15',
       'idem édition juin (6 paquets D0XX)', (SELECT count(*) FROM batiment);

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (S'EXÉCUTE quand tu lances le fichier — LECTURE SEULE) :
\echo '>>> PIÈGE DE LA VUE — lignes vues À TRAVERS la vue (doit = juin ~3 075 383, PAS mars 697 886) :'
SELECT (SELECT count(*) FROM bdtopo_batiment)     AS lignes_vue,
       (SELECT count(*) FROM batiment)            AS batiment_juin,
       (SELECT count(*) FROM batiment_2026_03_15) AS mars_conserve;
\echo '>>> CIBLE RÉELLE de la vue (doit nommer « batiment », pas « batiment_2026_03_15 ») :'
SELECT DISTINCT cl.relname AS vue_lit_la_table
FROM pg_rewrite r JOIN pg_depend d ON d.objid = r.oid
JOIN pg_class cl ON cl.oid = d.refobjid
WHERE r.ev_class = 'bdtopo_batiment'::regclass AND cl.relkind = 'r';
\echo '>>> index de la NOUVELLE batiment (attendu : batiment_cleabs_idx, batiment_geom_geom_idx, batiment_pkey) :'
SELECT indexname FROM pg_indexes WHERE tablename = 'batiment' ORDER BY indexname;
\echo '>>> contrainte PK + SRID (attendu : batiment_pkey, 2154) :'
SELECT conname FROM pg_constraint WHERE conrelid = 'batiment'::regclass AND contype = 'p';
SELECT Find_SRID('public','batiment','geom') AS srid;
\echo '>>> SÉQUENCE + DEFAULT nextval (le default doit pointer batiment_fid_seq, suivi automatiquement par OID) :'
SELECT to_regclass('public.batiment_fid_seq') AS seq_juin, to_regclass('public.batiment_2026_03_15_fid_seq') AS seq_mars;
SELECT column_default FROM information_schema.columns WHERE table_name = 'batiment' AND column_name = 'fid';
\echo '>>> TRIGGERS (attendu : aucun) et FK entrantes vers batiment (attendu : aucune) :'
SELECT count(*) AS triggers_batiment FROM pg_trigger WHERE tgrelid = 'batiment'::regclass AND NOT tgisinternal;
SELECT count(*) AS fk_vers_batiment  FROM pg_constraint WHERE confrelid = 'batiment'::regclass;
\echo '>>> édition courante (attendu : UNE seule, millesime 2026-06-15) :'
SELECT millesime, departement, courante FROM bdtopo_edition WHERE courante;
\echo '>>> FILET préservé (mars + filigrane intacts, rien droppé) :'
SELECT (SELECT count(*) FROM batiment_2026_03_15) AS mars, (SELECT count(*) FROM batiment_edition_fige) AS filigrane_mars;
\echo '>>> ENSUITE : lancer le GATE GOLDEN → npm run test:integration (golden 29.107259068449615 attendu INCHANGÉ).'

-- ═════════════════════════════════════════════════════════════════════════════
-- 🔙 ROLLBACK (une commande, au cas où — rien droppé, réversible intégralement). Symétrique de la bascule : la séquence est
--    renommée AVANT de reprendre le nom canonique, et la PK via RENAME CONSTRAINT (renomme contrainte + index). ⚠️ si la PK de
--    l'ancien mars était un index simple (sans contrainte), remplacer son unique « RENAME CONSTRAINT … » par « ALTER INDEX … ».
--   psql "$DATABASE_URL" -c "BEGIN; \
--     ALTER TABLE batiment RENAME TO batiment_2026_06_15; \
--     ALTER TABLE batiment_2026_06_15 RENAME CONSTRAINT batiment_pkey TO batiment_2026_06_15_pkey; \
--     ALTER INDEX batiment_geom_geom_idx RENAME TO batiment_2026_06_15_geom_geom_idx; \
--     ALTER INDEX batiment_cleabs_idx RENAME TO batiment_2026_06_15_cleabs_idx; \
--     ALTER SEQUENCE batiment_fid_seq RENAME TO batiment_2026_06_15_fid_seq; \
--     ALTER TABLE batiment_2026_03_15 RENAME TO batiment; \
--     ALTER TABLE batiment RENAME CONSTRAINT batiment_2026_03_15_pkey TO batiment_pkey; \
--     ALTER INDEX batiment_2026_03_15_geom_geom_idx RENAME TO batiment_geom_geom_idx; \
--     ALTER INDEX batiment_2026_03_15_cleabs_idx RENAME TO batiment_cleabs_idx; \
--     ALTER SEQUENCE batiment_2026_03_15_fid_seq RENAME TO batiment_fid_seq; \
--     CREATE OR REPLACE VIEW bdtopo_batiment AS SELECT fid AS id, cleabs, geom, hauteur, altitude_minimale_sol, altitude_maximale_toit, altitude_minimale_toit, nombre_d_etages, nature, usage_1, usage_2 FROM batiment; \
--     UPDATE bdtopo_edition SET courante=false WHERE courante; \
--     UPDATE bdtopo_edition SET courante=true WHERE millesime='2026-03-15' AND departement='D092'; \
--     COMMIT;"
