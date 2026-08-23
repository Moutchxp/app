-- 145_snapshot_etat_usage.sql — L9 : figer etat_de_l_objet + usage_1/usage_2 dans permis_bati_snapshot (donnée PÉRISSABLE).
--
-- CONTEXTE : permis_bati_snapshot fige déjà cleabs, geom, nombre_d_etages, altitude_max_toit, hauteur, date_modification, mais
-- PAS `etat_de_l_objet` (En service / En construction / En projet / En ruine) ni `usage_1` / `usage_2`. Ces colonnes existent sur
-- `batiment`. `etat_de_l_objet` est le signal d'achèvement le plus PRÉCOCE : l'IGN dessine le futur bâti « En projet » avant
-- construction, puis le bascule « En service ». Ce signal N'EST porté ni par le snapshot, ni par le filigrane batiment_edition_fige
-- (recon L9) → il disparaît DÉFINITIVEMENT au prochain remplacement d'édition BD TOPO. On ne veut plus le perdre.
--
-- CE QUE FAIT CETTE MIGRATION : ajoute 3 colonnes NULLABLES à permis_bati_snapshot, alignées sur les types de `batiment`
-- (character varying sans longueur ≡ `text`, comme la colonne `cleabs` du snapshot ; nullables ; aucune contrainte/enum côté source).
--   · etat_de_l_objet — état IGN de l'objet bâti (4 valeurs constatées : « En service », « En ruine », « En construction »,
--     « En projet »). Vocabulaire fermé (nomenclature IGN), mais NON contraint ici : on CAPTURE la valeur brute, on n'INTERPRÈTE pas.
--   · usage_1 / usage_2 — destination(s) IGN du bâti (« Résidentiel », « Commercial et services », …).
--
-- ADDITIVE / SÛRE : ADD COLUMN IF NOT EXISTS, sans DEFAULT → en PostgreSQL c'est un changement de MÉTADONNÉES (aucune réécriture
-- des lignes existantes). Les 2 captures déjà présentes reçoivent NULL sur ces colonnes : AUCUN backfill, on ne reconstitue pas un
-- passé qu'on n'a pas mesuré. Aucun DROP/DELETE/TRUNCATE, aucun trigger, aucune contrainte. Une transaction. Rejouable.
--
-- HORS CHEMIN DE CALCUL : n'affecte NI le moteur SVAV (app/lib/svv/*), NI detectionRattachement, NI le verdict, NI le golden, NI
-- config_scoring. Ce lot CAPTURE une donnée, il ne l'exploite pas (l'exploitation du signal sera un lot séparé).
--
-- NULL vs « absent en BD TOPO » : en BD TOPO ces attributs sont des varchar nullables ; un absent = NULL (pas de sentinelle). Le
-- schéma seul ne distingue donc pas « NULL car source vide » de « NULL car capture ANTÉRIEURE à cette migration » : `snapshot_le`
-- (horodatage de capture) tranche (les captures d'avant 145 ont NULL uniformément). En pratique `etat_de_l_objet` n'est jamais NULL
-- sur `batiment` (0 NULL constaté), donc un NULL post-145 signalerait une source réellement vide.
--
-- APPLICATION : psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/145_snapshot_etat_usage.sql
-- DRY-RUN : remplacer « COMMIT; » par « ROLLBACK; ».

BEGIN;

ALTER TABLE permis_bati_snapshot ADD COLUMN IF NOT EXISTS etat_de_l_objet text;
ALTER TABLE permis_bati_snapshot ADD COLUMN IF NOT EXISTS usage_1         text;
ALTER TABLE permis_bati_snapshot ADD COLUMN IF NOT EXISTS usage_2         text;

COMMENT ON COLUMN permis_bati_snapshot.etat_de_l_objet IS
  'L9 — état IGN de l''objet bâti figé au gel (« En service » / « En construction » / « En projet » / « En ruine »), copié de batiment.etat_de_l_objet. Signal d''achèvement précoce, périssable (perdu au remplacement d''édition). CAPTURE brute, non interprétée. NULL = source vide OU capture antérieure à la migration 145 (cf. snapshot_le).';
COMMENT ON COLUMN permis_bati_snapshot.usage_1 IS
  'L9 — destination principale IGN du bâti figée au gel (batiment.usage_1). NULL = source vide OU capture antérieure à 145.';
COMMENT ON COLUMN permis_bati_snapshot.usage_2 IS
  'L9 — destination secondaire IGN du bâti figée au gel (batiment.usage_2). NULL = source vide OU capture antérieure à 145.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (s'exécute au lancement) :
\echo '>>> ① colonnes ajoutées (type + nullabilité) :'
SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
WHERE table_name = 'permis_bati_snapshot' AND column_name IN ('etat_de_l_objet','usage_1','usage_2') ORDER BY column_name;
\echo '>>> ② les captures existantes ont NULL sur ces colonnes (aucun backfill) :'
SELECT count(*) AS lignes, count(etat_de_l_objet) AS avec_etat, count(usage_1) AS avec_usage1, count(usage_2) AS avec_usage2
FROM permis_bati_snapshot;
