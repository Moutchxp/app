-- 119_batiment_cleabs_index.sql — chantier BDT-3 : INDEX btree sur batiment(cleabs).
--
-- ⚠️ POURQUOI : `cleabs` est la CLÉ DE JOINTURE de tout le module permis vers la BD TOPO, or `batiment` n'a QUE deux index
-- (mesuré en BDT-0) : batiment_pkey (fid) et batiment_geom_geom_idx (GiST sur geom). AUCUN index sur `cleabs`. Chaque accès par
-- cleabs fait donc un SEQ SCAN sur 697 886 lignes aujourd'hui — et ce sera ~2,8 M après l'import des 6 départements. Sites d'accès
-- RUNTIME concernés (chemin d'injection FUS-3e/3f) :
--   · app/lib/permis/actionsRattachement.ts:46  → lidarCourant   : SELECT altitude_maximale_toit FROM batiment WHERE cleabs = $1
--   · app/lib/permis/journalAltitude.ts:62       → dateModifBatiment : SELECT date_modification FROM batiment WHERE cleabs = $1
-- (plus les CLI de contrôle profil-check / contact-pente-check, via la vue bdtopo_batiment → batiment).
--
-- ⚠️ PAS d'index UNIQUE — décision explicite. BDT-0 a mesuré 0 doublon de cleabs AUJOURD'HUI, mais BD TOPO ne GARANTIT pas
-- l'unicité inter-livraison : un réimport futur qui introduirait un doublon ferait ÉCHOUER une contrainte UNIQUE au pire moment
-- (au milieu du chargement). Un btree simple offre EXACTEMENT la même performance de lecture sans ce risque. On indexe pour la
-- vitesse, pas pour contraindre.
--
-- ⚠️ PAS de CREATE INDEX CONCURRENTLY — inutile ici : `batiment` est une table de RÉFÉRENCE statique, chargée hors ligne (aucun
-- écrivain concurrent au runtime), donc le verrou d'un CREATE INDEX ordinaire ne bloque personne. Et CONCURRENTLY ne peut de toute
-- façon PAS s'exécuter dans un bloc transactionnel (BEGIN/COMMIT) — l'index ordinaire est le bon choix, cohérent avec le dépôt.
--
-- SÛR : DDL strictement ADDITIVE (CREATE INDEX … IF NOT EXISTS). Aucun index existant supprimé ou modifié. Ne touche NI le moteur
-- de verdict SVAV, NI le golden, NI la vue bdtopo_batiment (la vue n'est pas recréée ; l'index sert la table sous-jacente et est
-- utilisé À TRAVERS la vue sans la changer). Idempotente. Un seul BEGIN/COMMIT. Requiert la table `batiment`. Application MANUELLE
-- (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/119_batiment_cleabs_index.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS.

BEGIN;

CREATE INDEX IF NOT EXISTS batiment_cleabs_idx ON batiment (cleabs);

COMMENT ON INDEX batiment_cleabs_idx IS
  'BDT-3 — index btree sur batiment.cleabs : clé de jointure du module permis vers la BD TOPO (lidarCourant, dateModifBatiment, importBdTopoSuivis, et les accès via la vue bdtopo_batiment). Évite le seq scan sur ~698 k lignes (bientôt ~2,8 M). NON unique À DESSEIN : BD TOPO ne garantit pas l''unicité inter-livraison ; un réimport avec doublon casserait une contrainte UNIQUE au pire moment, à performance de lecture identique.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (S'EXÉCUTE quand tu lances le fichier — LECTURE SEULE) :
\echo '>>> index de batiment (attendu : batiment_pkey, batiment_geom_geom_idx, batiment_cleabs_idx) :'
SELECT indexname FROM pg_indexes WHERE tablename = 'batiment' ORDER BY indexname;
\echo '>>> définition + taille du nouvel index :'
SELECT indexdef FROM pg_indexes WHERE indexname = 'batiment_cleabs_idx';
SELECT pg_size_pretty(pg_relation_size('batiment_cleabs_idx')) AS taille_index;
\echo '>>> preuve d''usage : le lookup par cleabs passe par l''index (Index Scan attendu, plus de Seq Scan) :'
EXPLAIN SELECT altitude_maximale_toit FROM batiment WHERE cleabs = 'BATIMENT0000000240320058';
