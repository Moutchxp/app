-- 226_permis_gel_corps_emprise_completude.sql — RATT-EDIT (lot A1-bis/7) : COMPLÈTE les tables de gel détail (225) pour que la capture
--   (lot B1) SUFFISE à RECONSTRUIRE l'état de travail exactement tel qu'à la validation (restauration, lot C1).
--
-- ⚠️ POURQUOI (test de suffisance de la recon B1) : en Rattachement, un collaborateur avec perm_permis_modif peut SUPPRIMER pour de bon
--   un corps (`supprimerCorps` = DELETE dur, caracteristiquesRepo.ts:206) ou une emprise (`supprimerEmprise` = DELETE dur), et modifier
--   les 7 mesures d'un corps (`ecrireCorps`) — pas seulement le sommet. Le gel 225 ne capturait que le sommet (gel_corps) et
--   geom/ajustement/surface/validee (gel_emprise) : INSUFFISANT pour RECRÉER une ligne supprimée (colonnes NOT NULL source non capturées :
--   permis_emprise_reconstruite.libelle/calage/provenance) ni pour restaurer les autres mesures d'un corps. Comme les tables de gel sont
--   APPEND-ONLY, une capture incomplète figerait des gels irrécupérables. On complète donc le SCHÉMA AVANT toute capture.
--
-- ═══ RÈGLE DE FORME (décision Arno) : les colonnes de GEL sont NULLABLES ═══════════════════════════════════════════════════════════════
--   Un gel PHOTOGRAPHIE ce qui existait à l'instant T, y compris un champ vide. On N'HÉRITE PAS des NOT NULL de la source (ex. libelle,
--   calage, provenance, actif sont NOT NULL dans permis_*, mais NULLABLES ici) : une contrainte NOT NULL sur un gel ferait échouer la
--   capture d'un état réel. Le contrôle de validité est à la RESTAURATION (lot C1), jamais à la capture.
--
-- ═══ CONTENU (test de suffisance : recréer une ligne source supprimée, à l'identique) ═════════════════════════════════════════════════
--   · permis_gel_emprise += libelle, calage, provenance, reconstitution, piece_id, page, residu_m, cree_par, cree_le → avec geom/ajustement/
--     surface_m2/validee_le/validee_par (225) et corps_id/emprise_id (225), on tient TOUTES les colonnes de permis_emprise_reconstruite
--     sauf `id` (serial, réattribué) et `dossier_id` (dérivable du gel_id → permis_gel.dossier_id).
--   · permis_gel_corps += les 7 autres mesures + leurs origines, repère, adresse (+origine), + tout le reste du corps (emprise legacy,
--     cleabs_affecte, nom_repli, marqueurs 206, actif, desactive_*, maj_*) → TOUTES les colonnes de permis_corps_batiment sauf `id` (serial)
--     et `dossier_id` (dérivable). Le sommet + ses marqueurs sont déjà en 225.
--
-- SÛR : DDL STRICTEMENT ADDITIVE — uniquement ADD COLUMN IF NOT EXISTS, toutes NULLABLES, AUCUN défaut (⇒ changement de MÉTADONNÉE seul,
--   aucune réécriture de lignes). Aucun DROP, aucune contrainte ajoutée sur l'existant, aucune donnée touchée, AUCUN backfill (les permis
--   validés à ce jour restent sans gel — décision A1). 🔴 ADD COLUMN NULLABLE SANS DÉFAUT est du DDL : il NE déclenche PAS le trigger de
--   ligne append-only (BEFORE UPDATE/DELETE FOR EACH ROW) — celui-ci ne réagit qu'aux DML sur des lignes, pas à une ALTER TABLE. De plus les
--   deux tables sont VIDES à ce jour. Ne touche NI le moteur, NI le verdict, NI le golden, NI estValidationAcquise/rattachementGroupes.
--   Une seule transaction. Rejouable.
--
-- Application MANUELLE (Arno), arrêt au 1er échec — 🔴 TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE) :
--   cd /Users/macbookprom4arnaud/sansvisavis/app
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/226_permis_gel_corps_emprise_completude.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ».

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 1) permis_gel_emprise — de quoi RECRÉER une ligne permis_emprise_reconstruite supprimée (toutes NULLABLES).
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
ALTER TABLE permis_gel_emprise ADD COLUMN IF NOT EXISTS libelle        text;
ALTER TABLE permis_gel_emprise ADD COLUMN IF NOT EXISTS calage         jsonb;
ALTER TABLE permis_gel_emprise ADD COLUMN IF NOT EXISTS provenance     text;
ALTER TABLE permis_gel_emprise ADD COLUMN IF NOT EXISTS reconstitution boolean;
ALTER TABLE permis_gel_emprise ADD COLUMN IF NOT EXISTS piece_id       bigint;
ALTER TABLE permis_gel_emprise ADD COLUMN IF NOT EXISTS page           integer;
ALTER TABLE permis_gel_emprise ADD COLUMN IF NOT EXISTS residu_m       numeric;
ALTER TABLE permis_gel_emprise ADD COLUMN IF NOT EXISTS cree_par       text;
ALTER TABLE permis_gel_emprise ADD COLUMN IF NOT EXISTS cree_le        timestamptz;

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 2) permis_gel_corps — les 7 autres mesures + origines + tout le reste du corps (toutes NULLABLES). Le sommet + marqueurs sont en 225.
--    `emprise` = emprise legacy niveau corps (geometry(Polygon,2154), miroir exact de la source).
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
ALTER TABLE permis_gel_corps ADD COLUMN IF NOT EXISTS repere                                   text;
ALTER TABLE permis_gel_corps ADD COLUMN IF NOT EXISTS nb_etages                                integer;
ALTER TABLE permis_gel_corps ADD COLUMN IF NOT EXISTS nb_etages_origine                        text;
ALTER TABLE permis_gel_corps ADD COLUMN IF NOT EXISTS nb_niveaux_sous_sol                      integer;
ALTER TABLE permis_gel_corps ADD COLUMN IF NOT EXISTS nb_niveaux_sous_sol_origine              text;
ALTER TABLE permis_gel_corps ADD COLUMN IF NOT EXISTS altitude_dernier_plancher_ngf            numeric;
ALTER TABLE permis_gel_corps ADD COLUMN IF NOT EXISTS altitude_dernier_plancher_ngf_origine    text;
ALTER TABLE permis_gel_corps ADD COLUMN IF NOT EXISTS hauteur_relative_m                       numeric;
ALTER TABLE permis_gel_corps ADD COLUMN IF NOT EXISTS hauteur_relative_m_origine               text;
ALTER TABLE permis_gel_corps ADD COLUMN IF NOT EXISTS altitude_terrain_naturel_ngf             numeric;
ALTER TABLE permis_gel_corps ADD COLUMN IF NOT EXISTS altitude_terrain_naturel_ngf_origine     text;
ALTER TABLE permis_gel_corps ADD COLUMN IF NOT EXISTS hauteur_max_plu_ngf                      numeric;
ALTER TABLE permis_gel_corps ADD COLUMN IF NOT EXISTS hauteur_max_plu_ngf_origine              text;
ALTER TABLE permis_gel_corps ADD COLUMN IF NOT EXISTS altitude_plateau_nivellement_ngf         numeric;
ALTER TABLE permis_gel_corps ADD COLUMN IF NOT EXISTS altitude_plateau_nivellement_ngf_origine text;
ALTER TABLE permis_gel_corps ADD COLUMN IF NOT EXISTS adresse                                  text;
ALTER TABLE permis_gel_corps ADD COLUMN IF NOT EXISTS adresse_origine                          text;
ALTER TABLE permis_gel_corps ADD COLUMN IF NOT EXISTS emprise                                  geometry(Polygon, 2154);
ALTER TABLE permis_gel_corps ADD COLUMN IF NOT EXISTS emprise_origine                          text;
ALTER TABLE permis_gel_corps ADD COLUMN IF NOT EXISTS cleabs_affecte                           text;
ALTER TABLE permis_gel_corps ADD COLUMN IF NOT EXISTS nom_repli                                text;
ALTER TABLE permis_gel_corps ADD COLUMN IF NOT EXISTS emprise_validee_id                       bigint;
ALTER TABLE permis_gel_corps ADD COLUMN IF NOT EXISTS emprise_validee_le                       timestamptz;
ALTER TABLE permis_gel_corps ADD COLUMN IF NOT EXISTS emprise_validee_par                      text;
ALTER TABLE permis_gel_corps ADD COLUMN IF NOT EXISTS actif                                    boolean;
ALTER TABLE permis_gel_corps ADD COLUMN IF NOT EXISTS desactive_le                             timestamptz;
ALTER TABLE permis_gel_corps ADD COLUMN IF NOT EXISTS desactive_par                            text;
ALTER TABLE permis_gel_corps ADD COLUMN IF NOT EXISTS maj_le                                   timestamptz;
ALTER TABLE permis_gel_corps ADD COLUMN IF NOT EXISTS maj_par                                  text;

COMMENT ON TABLE permis_gel_emprise IS 'RATT-EDIT — DÉTAIL append-only : SNAPSHOT COMPLET d''une emprise reconstruite à la validation (toutes les colonnes de permis_emprise_reconstruite sauf id/dossier_id), NULLABLES, pour RECRÉER la ligne à la restauration (lot C1). Rempli lot B1. Trigger permis_gel_append_only.';
COMMENT ON TABLE permis_gel_corps   IS 'RATT-EDIT — DÉTAIL append-only : SNAPSHOT COMPLET d''un corps de bâtiment à la validation (toutes les colonnes de permis_corps_batiment sauf id/dossier_id : sommet+marqueurs en 225, le reste en 226), NULLABLES, pour RECRÉER/RESTAURER le corps à la restauration (lot C1). Rempli lot B1. Trigger permis_gel_append_only.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (LECTURE SEULE) :
\echo '>>> ① permis_gel_emprise : colonnes attendues présentes (geom+ajustement+surface+validee de 225 + les 9 de 226) :'
SELECT string_agg(column_name, ', ' ORDER BY ordinal_position) AS colonnes FROM information_schema.columns WHERE table_name = 'permis_gel_emprise';
\echo '>>> ② permis_gel_corps : colonnes attendues présentes (sommet+marqueurs de 225 + les 29 de 226) :'
SELECT string_agg(column_name, ', ' ORDER BY ordinal_position) AS colonnes FROM information_schema.columns WHERE table_name = 'permis_gel_corps';
\echo '>>> ③ SUFFISANCE — colonnes de permis_emprise_reconstruite ABSENTES du gel (attendu : SEULEMENT id, dossier_id) :'
SELECT s.column_name FROM information_schema.columns s
 WHERE s.table_name = 'permis_emprise_reconstruite'
   AND NOT EXISTS (SELECT 1 FROM information_schema.columns g WHERE g.table_name = 'permis_gel_emprise' AND g.column_name = s.column_name)
 ORDER BY s.ordinal_position;
\echo '>>> ④ SUFFISANCE — colonnes de permis_corps_batiment ABSENTES du gel (attendu : SEULEMENT id, dossier_id) :'
SELECT s.column_name FROM information_schema.columns s
 WHERE s.table_name = 'permis_corps_batiment'
   AND NOT EXISTS (SELECT 1 FROM information_schema.columns g WHERE g.table_name = 'permis_gel_corps' AND g.column_name = s.column_name)
 ORDER BY s.ordinal_position;
\echo '>>> ⑤ toutes les colonnes de gel sont NULLABLES (attendu : aucune ligne = aucune NOT NULL héritée à tort ; hors id/gel_id techniques) :'
SELECT table_name, column_name FROM information_schema.columns
 WHERE table_name IN ('permis_gel_emprise','permis_gel_corps') AND is_nullable = 'NO' AND column_name NOT IN ('id','gel_id')
 ORDER BY table_name, column_name;
\echo '>>> ⑥ triggers append-only toujours en place (inchangés par l''ADD COLUMN) :'
SELECT tgrelid::regclass AS tbl, tgname FROM pg_trigger
 WHERE tgrelid IN ('permis_gel_emprise'::regclass,'permis_gel_corps'::regclass) AND NOT tgisinternal ORDER BY tbl, tgname;
\echo '>>> ⑦ AUCUN backfill : les tables de gel détail restent vides (attendu 0 / 0) :'
SELECT (SELECT count(*) FROM permis_gel_emprise) AS gel_emprise, (SELECT count(*) FROM permis_gel_corps) AS gel_corps;

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 🔙 ROLLBACK (additive → réversible en dropant les colonnes ajoutées ; les tables/triggers de 225 restent) :
--   psql "$DATABASE_URL" -c "BEGIN; \
--     ALTER TABLE permis_gel_emprise DROP COLUMN IF EXISTS libelle, DROP COLUMN IF EXISTS calage, DROP COLUMN IF EXISTS provenance, \
--       DROP COLUMN IF EXISTS reconstitution, DROP COLUMN IF EXISTS piece_id, DROP COLUMN IF EXISTS page, DROP COLUMN IF EXISTS residu_m, \
--       DROP COLUMN IF EXISTS cree_par, DROP COLUMN IF EXISTS cree_le; \
--     ALTER TABLE permis_gel_corps DROP COLUMN IF EXISTS repere, DROP COLUMN IF EXISTS nb_etages, DROP COLUMN IF EXISTS nb_etages_origine, \
--       DROP COLUMN IF EXISTS nb_niveaux_sous_sol, DROP COLUMN IF EXISTS nb_niveaux_sous_sol_origine, DROP COLUMN IF EXISTS altitude_dernier_plancher_ngf, \
--       DROP COLUMN IF EXISTS altitude_dernier_plancher_ngf_origine, DROP COLUMN IF EXISTS hauteur_relative_m, DROP COLUMN IF EXISTS hauteur_relative_m_origine, \
--       DROP COLUMN IF EXISTS altitude_terrain_naturel_ngf, DROP COLUMN IF EXISTS altitude_terrain_naturel_ngf_origine, DROP COLUMN IF EXISTS hauteur_max_plu_ngf, \
--       DROP COLUMN IF EXISTS hauteur_max_plu_ngf_origine, DROP COLUMN IF EXISTS altitude_plateau_nivellement_ngf, DROP COLUMN IF EXISTS altitude_plateau_nivellement_ngf_origine, \
--       DROP COLUMN IF EXISTS adresse, DROP COLUMN IF EXISTS adresse_origine, DROP COLUMN IF EXISTS emprise, DROP COLUMN IF EXISTS emprise_origine, \
--       DROP COLUMN IF EXISTS cleabs_affecte, DROP COLUMN IF EXISTS nom_repli, DROP COLUMN IF EXISTS emprise_validee_id, DROP COLUMN IF EXISTS emprise_validee_le, \
--       DROP COLUMN IF EXISTS emprise_validee_par, DROP COLUMN IF EXISTS actif, DROP COLUMN IF EXISTS desactive_le, DROP COLUMN IF EXISTS desactive_par, \
--       DROP COLUMN IF EXISTS maj_le, DROP COLUMN IF EXISTS maj_par; \
--     COMMIT;"
