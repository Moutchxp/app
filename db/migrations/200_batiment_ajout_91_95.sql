-- 200_batiment_ajout_91_95.sql — LOT 117b : FUSIONNER les départements 91 (Essonne) et 95 (Val-d'Oise) dans la table VIVE
-- `batiment`, depuis la table de STAGING `batiment_ajout_91_95` produite au LOT 117a. Dernier maillon manquant de la couverture
-- bâti d'Île-de-France (6/8 -> 8/8). INSERT dédupliqué par cleabs contre les objets déjà présents (les 6 dép. centraux), fid
-- RÉGÉNÉRÉ par la séquence de batiment. Ne touche NI le moteur, NI pipeline.itest.ts, NI `batiment_2026_03_15` (filet mars), NI
-- `batiment_edition_fige` (preuve mars). Le garde-fou du script bdtopo:import (cible != batiment) reste intact : c'est ICI, dans
-- une migration RELUE et ATOMIQUE, que l'on écrit dans la table vive — jamais « à la main » par le CLI.
--
-- ═══ POURQUOI UNE MIGRATION, PAS LE CLI ═══════════════════════════════════════════════════════════════════════════════════════
-- Après le swap BDT-4b (migration 121), `batiment` EST l'édition vive porteuse du golden. Le script bdtopo:import interdit en dur
-- d'y écrire (protection délibérée). Ajouter 2 départements = un INSERT borné, dédupliqué, tracé et RÉVERSIBLE → exactement le
-- périmètre d'une migration relue, sur le modèle de la 121. Les paquets 91/95 DÉBORDENT sur les 6 dép. déjà chargés (bâtiments
-- frontaliers livrés en double, cleabs BYTE-IDENTIQUES car MÊME édition 2026-06-15) → on GARDE la 1re occurrence (déjà en base),
-- on COMPTE et AFFICHE les collisions. 91 et 95 n'étant pas limitrophes (de part et d'autre de Paris), ils n'ont eu 0 collision
-- ENTRE EUX au 117a ; les collisions comptées ici sont vs les 6 dép. centraux (78, 92, 93, 77… pour 95 ; 78, 91→77/92… pour 91).
--
-- ⚠️ PRÉREQUIS : LOT 117a exécuté (batiment_ajout_91_95 présente, ~1,78 M objets, indexée). Migration 121 appliquée (batiment =
-- édition juin). Ce fichier N'EST PAS lancé automatiquement — Arno l'applique.
--
-- 🔴 PIÈGE DE LA VUE (leçon BDT-4b) : bdtopo_batiment lit `batiment` par OID. On NE renomme RIEN ici (simple INSERT) → l'OID de
-- batiment ne change pas → la vue reste correcte. On le VÉRIFIE quand même explicitement (bloc de vérif), on ne le suppose pas.
--
-- SÛR : tout dans UNE transaction (BEGIN/COMMIT). Colonnes ÉNUMÉRÉES dynamiquement depuis information_schema (allowlist, ordre de
-- batiment) → aucune faute de frappe possible sur 29 colonnes, et un GARDE-FOU refuse d'insérer si les deux tables divergent.
-- IDEMPOTENTE : re-jouée, l'INSERT … WHERE NOT EXISTS insère 0 ligne (tous les cleabs sont déjà là). ATOMIQUE → un ROLLBACK laisse
-- la base intacte. Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/200_batiment_ajout_91_95.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS (attente de ma confirmation — LOT 117b).
--
-- 🔴 GATE GOLDEN (À FAIRE APRÈS APPLICATION, hors de ce fichier) :
--   npm run test:integration    (golden 29.107259068449615)
--   · VERT (inchangé) → parfait, aucun rescellage. · ROUGE → ARRÊTER. NE PAS rescelller, NE PAS toucher pipeline.itest.ts.
--     Rollback (pied de fichier), puis remonter l'écart + son origine à Arno : le rescellage est SA décision, en commit séparé.
--   NB : le bâti alimente l'emprise du point d'origine ; le golden PEUT bouger si un obstacle 91/95 entre dans le faisceau du cas
--   scellé (Asnières, 92) — improbable géographiquement, mais à VÉRIFIER, pas à supposer.

BEGIN;

DO $$
DECLARE
  cols        text;
  nb_cible    int;
  nb_communes int;
  fid_avant   bigint;
  count_avant bigint;
  livres      bigint;
  inseres     bigint;
  collisions  bigint;
BEGIN
  -- 0) GARDES : la table vive et le staging doivent exister, le staging paraître complet.
  IF to_regclass('public.batiment') IS NULL THEN RAISE EXCEPTION 'batiment absente'; END IF;
  IF to_regclass('public.batiment_ajout_91_95') IS NULL THEN
    RAISE EXCEPTION 'batiment_ajout_91_95 absente : lancer le LOT 117a (bdtopo:import --cible batiment_ajout_91_95) d''abord';
  END IF;
  SELECT count(*) INTO livres FROM batiment_ajout_91_95;
  IF livres < 1000000 THEN RAISE EXCEPTION 'batiment_ajout_91_95 incomplète (% lignes < 1M) : vérifier le LOT 117a', livres; END IF;

  -- 1) COLONNES COMMUNES (hors fid, régénéré), dans l'ordre de batiment. Identifiants issus d'information_schema (allowlist) →
  --    interpolation sûre via %I. Un GARDE-FOU exige que TOUTE colonne de batiment (hors fid) soit couverte : sinon divergence
  --    de schéma → on refuse d'insérer (un INSERT à colonnes manquantes corromprait silencieusement la table vive).
  SELECT string_agg(format('%I', c.column_name), ', ' ORDER BY c.ordinal_position) INTO cols
    FROM information_schema.columns c
   WHERE c.table_name = 'batiment' AND c.column_name <> 'fid'
     AND EXISTS (SELECT 1 FROM information_schema.columns s
                  WHERE s.table_name = 'batiment_ajout_91_95' AND s.column_name = c.column_name);
  SELECT count(*) INTO nb_cible   FROM information_schema.columns WHERE table_name = 'batiment' AND column_name <> 'fid';
  SELECT count(*) INTO nb_communes FROM regexp_split_to_table(cols, ', ') t;
  IF nb_communes <> nb_cible THEN
    RAISE EXCEPTION 'schéma divergent : % colonnes communes sur % attendues (batiment hors fid). Insertion refusée.', nb_communes, nb_cible;
  END IF;

  -- 2) BORNE DE RETOUR ARRIÈRE : max(fid) AVANT l'insert. Les nouvelles lignes reçoivent des fid > fid_avant (séquence de
  --    batiment, aucun écrivain runtime sur cette table de référence) → rollback = DELETE des fid > fid_avant, chirurgical et SÛR.
  SELECT count(*), coalesce(max(fid), 0) INTO count_avant, fid_avant FROM batiment;

  -- 3) FUSION dédupliquée par cleabs (1re occurrence gagnante = objet déjà en base). fid NON listé → default nextval(batiment).
  EXECUTE format(
    'INSERT INTO batiment (%1$s)
     SELECT %1$s FROM batiment_ajout_91_95 s
      WHERE s.cleabs IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM batiment b WHERE b.cleabs = s.cleabs)', cols);
  GET DIAGNOSTICS inseres = ROW_COUNT;
  collisions := livres - inseres;

  -- 4) JOURNAL : la bascule est tracée (jamais un changement de couverture anonyme). La BORNE de rollback est écrite EN DUR dans
  --    import_log.emprise → récupérable même sans relire ce NOTICE.
  INSERT INTO import_log (table_cible, source, emprise, nb_objets)
  VALUES ('batiment',
          'FUSION LOT 117b : batiment <- 91/95 depuis batiment_ajout_91_95 (dédup cleabs vs 6 dép. vives ; ancien mars conservé)',
          format('livrés %s / insérés %s / collisions %s ; ROLLBACK: DELETE FROM batiment WHERE fid > %s',
                 livres, inseres, collisions, fid_avant),
          inseres);

  -- 5) STAMP couverture : les lignes bdtopo_edition D091/D095 existent déjà (posées au 117a, courante=false). On complète leur
  --    note pour acter la fusion dans la table vive. courante INCHANGÉE (D092 2026-06-15 reste la courante ; les 8 lignes juin
  --    partagent le même millésime — cf. 121).
  UPDATE bdtopo_edition
     SET note = note || format(' | LOT 117b : fusionné dans batiment (%s insérés, %s collisions vs vif, fid > %s).',
                               inseres, collisions, fid_avant)
   WHERE departement IN ('D091', 'D095') AND millesime = '2026-06-15';

  RAISE NOTICE 'LOT 117b OK : livrés=% · insérés=% · collisions=% · fid_avant=% (ROLLBACK: DELETE FROM batiment WHERE fid > %)',
               livres, inseres, collisions, fid_avant, fid_avant;
END $$;

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (S'EXÉCUTE quand tu lances le fichier — LECTURE SEULE, PROUVE, ne suppose pas) :
\echo '>>> PIÈGE DE LA VUE — lignes vues À TRAVERS bdtopo_batiment (doit = count(batiment), PAS une valeur figée) :'
SELECT (SELECT count(*) FROM bdtopo_batiment) AS lignes_vue,
       (SELECT count(*) FROM batiment)        AS batiment_total;
\echo '>>> CIBLE RÉELLE de la vue (doit nommer « batiment », OID inchangé par un simple INSERT) :'
SELECT DISTINCT cl.relname AS vue_lit_la_table
FROM pg_rewrite r JOIN pg_depend d ON d.objid = r.oid
JOIN pg_class cl ON cl.oid = d.refobjid
WHERE r.ev_class = 'bdtopo_batiment'::regclass AND cl.relkind = 'r';
\echo '>>> INDEX de batiment (attendu : batiment_cleabs_idx, batiment_geom_geom_idx, batiment_pkey — batiment_geom2d_gix supprimé en 123) :'
SELECT indexname FROM pg_indexes WHERE tablename = 'batiment' ORDER BY indexname;
\echo '>>> STAMP couverture (D091/D095, note complétée « LOT 117b : fusionné ») :'
SELECT departement, courante, nb_objets, right(note, 70) AS fin_note FROM bdtopo_edition WHERE departement IN ('D091','D095') ORDER BY departement;
\echo '>>> DERNIÈRE ligne import_log (contient la BORNE de rollback) :'
SELECT table_cible, emprise, nb_objets FROM import_log WHERE table_cible = 'batiment' ORDER BY id DESC LIMIT 1;

\echo '>>> PERF — requête FAISCEAU du moteur (prédicats DÉ-ENVELOPPÉS, cf. migration 123) : plan attendu = Index Scan via'
\echo '    batiment_geom_geom_idx, JAMAIS Seq Scan (référence mesurée : ~0,3 ms sur le cas Asnières) :'
EXPLAIN (ANALYZE, BUFFERS)
WITH o AS (SELECT ST_Transform(ST_SetSRID(ST_MakePoint(2.269431435588249,48.90693182287072),4326),2154) AS g),
couloir AS (SELECT o.g AS origine, ST_Buffer(ST_MakeLine(o.g, ST_Translate(o.g, 200*sin(radians(90)), 200*cos(radians(90)))), 1.0) AS corr FROM o)
SELECT b.id, ST_Distance(ST_Force2D(b.geom), c.origine) AS dist_m
FROM bdtopo_batiment b, couloir c
WHERE ST_Intersects(b.geom, c.corr) AND b.id <> -1 AND NOT ST_Contains(b.geom, c.origine)
ORDER BY dist_m ASC;

\echo '>>> ENSUITE : (1) GATE GOLDEN → npm run test:integration (29.107259068449615 attendu INCHANGÉ) ;'
\echo '             (2) VACUUM ANALYZE batiment (une table par -c, hors transaction) ;'
\echo '             (3) une fois validé : DROP TABLE batiment_ajout_91_95 (staging devenu inutile) — commit séparé.'

-- ═════════════════════════════════════════════════════════════════════════════
-- 🔙 ROLLBACK (chirurgical, une commande — rien n'a été renommé/droppé, aucun écrivain runtime sur batiment). Remplace <FID_AVANT>
--    par la borne affichée dans le NOTICE et stockée dans import_log.emprise (ROLLBACK: DELETE FROM batiment WHERE fid > …) :
--   psql "$DATABASE_URL" -c "BEGIN; \
--     DELETE FROM batiment WHERE fid > <FID_AVANT>; \
--     UPDATE bdtopo_edition SET note = regexp_replace(note, ' \\| LOT 117b : fusionné.*$', '') WHERE departement IN ('D091','D095') AND millesime='2026-06-15'; \
--     COMMIT;"
-- ⚠️ NE PAS rollback par cleabs (DELETE … WHERE cleabs IN (SELECT cleabs FROM batiment_ajout_91_95)) : les cleabs en COLLISION
--    existent AUSSI dans les 6 dép. déjà présents → un DELETE par cleabs supprimerait des bâtiments LÉGITIMES pré-existants.
--    La borne fid est le SEUL critère qui ne vise QUE les lignes insérées par cette migration.
