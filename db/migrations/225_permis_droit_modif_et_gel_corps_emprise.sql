-- 225_permis_droit_modif_et_gel_corps_emprise.sql — RATT-EDIT (lot A1/7) : SCHÉMA pour « modifier un permis après validation » dans Rattachement.
--
-- ⚠️ POURQUOI (deux parties, un seul lot de SCHÉMA — AUCUN code applicatif ici : session/proxy/garde/écrans sont les lots A2/A3/B*) :
--   PARTIE 1 — DROITS. L'onglet « Permis de construire » est aujourd'hui ADMINISTRATEUR-ONLY (proxy fail-closed + 46 routes en
--     exigerAdministrateur). On prépare deux nouveaux drapeaux par compte, sur le PATRON EXACT des 6 perm_* existantes (014) :
--       · perm_permis        — accès au MODULE « Permis de construire » (deviendra un module gardé comme les 6 autres, lot A2) ;
--       · perm_permis_modif  — SOUS-DROIT « modifier un permis APRÈS validation » (dans Rattachement) ; garde des seuls gestes de modif (lot A3).
--     Ce sont des VARIABLES D'ADMINISTRATION destinées à être cochées par un non-développeur dans « Administratif — comptes » : type/nom
--     IDENTIQUES aux perm_* existantes (boolean NOT NULL DEFAULT false) → un futur écran les lit/écrit sans cas particulier.
--   PARTIE 2 — GEL DÉTAIL. La modif touche deux tables de travail MUTABLES et SANS TRIGGER (permis_corps_batiment.altitude_sommet_ngf* et
--     permis_emprise_reconstruite.geom/ajustement/validee_*) : aujourd'hui une modif ÉCRASE sans trace (④ « qui/quand » partiel, ⑤ original
--     NON restaurable). On étend le REGISTRE APPEND-ONLY VERSIONNÉ permis_gel (169) — qui se déclenche DÉJÀ à chaque validation
--     (figerVersionValidation) — avec DEUX tables de détail sœurs de permis_gel_bati/permis_gel_parcelle :
--       · permis_gel_corps    — sommet + ses marqueurs de validation, figés par version ;
--       · permis_gel_emprise  — géométrie d'emprise + ajustement + marqueurs, figés par version (l'ENSEMBLE des emprises d'un corps →
--                               couvre restauration des suppressions/ajouts, pas seulement une retouche).
--     La CAPTURE réelle (remplir ces tables à la validation) et la RESTAURATION sont les lots B1/C1 (code) — ce lot ne fait que le SCHÉMA.
--
-- 🔴 PAS de duplication de permis_altitude_journal : il couvre l'altitude d'INJECTION au verdict (permis_polygone_altitude, par cleabs) —
--    PAS le sommet manuel du corps ni la géométrie d'emprise reconstruite. Objets DISJOINTS.
-- 🔴 PAS de backfill des tables de gel détail : l'état COURANT des tables de travail n'est PAS l'état figé des versions de gel PASSÉES
--    (les gels 169 antérieurs ont été pris sans ce détail). Le remplir rétroactivement serait MENSONGER. Les versions antérieures restent
--    sans détail corps/emprise (honnête — « détail non capturé », même philosophie que permis_altitude_journal.gel_id NULL en 169). La
--    capture démarre aux validations FUTURES (lot B1).
--
-- SÛR : DDL strictement ADDITIVE — ADD COLUMN IF NOT EXISTS, CREATE TABLE/INDEX/TRIGGER IF NOT EXISTS, une SEULE UPDATE de données
--   (poser perm_permis/perm_permis_modif=true sur les comptes ADMINISTRATEUR, idempotente). Aucun DROP de table/colonne, aucune colonne
--   existante modifiée en place, aucune donnée existante réécrite, aucun DELETE/TRUNCATE. Réutilise la fonction trigger EXISTANTE
--   permis_gel_append_only() (169, déjà en base). Ne touche NI le moteur SVAV (app/lib/db, app/lib/svv), NI le verdict, NI le golden
--   Asnières (29.107259068449615), NI config_scoring, NI estValidationAcquise/rattachementGroupes, NI les écrans. Une seule transaction. Rejouable.
--
-- Application MANUELLE (Arno), arrêt au 1er échec — 🔴 TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE) :
--   cd /Users/macbookprom4arnaud/sansvisavis/app
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/225_permis_droit_modif_et_gel_corps_emprise.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ».

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- PARTIE 1 — DROITS PAR COMPTE (patron EXACT des 6 perm_* de 014 : boolean NOT NULL DEFAULT false).
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
ALTER TABLE admin_utilisateur ADD COLUMN IF NOT EXISTS perm_permis       boolean NOT NULL DEFAULT false;
ALTER TABLE admin_utilisateur ADD COLUMN IF NOT EXISTS perm_permis_modif boolean NOT NULL DEFAULT false;

-- Migration (b, décision Arno) : la tuile « Permis » est cochée pour les SEULS ADMINISTRATEURS ; le sous-droit « modifier après validation »
--   suit la règle « administrateur = tout coché, forcé » (comme les 6 modules à la promotion). Les COLLABORATEURS restent à false (DEFAULT) :
--   ils n'ont AUCUN accès permis aujourd'hui → on ne leur en donne pas ; Arno accordera compte par compte (lots A2/A3). Idempotent.
UPDATE admin_utilisateur
   SET perm_permis = true, perm_permis_modif = true
 WHERE role = 'administrateur' AND (perm_permis = false OR perm_permis_modif = false);

COMMENT ON COLUMN admin_utilisateur.perm_permis       IS 'RATT-EDIT — accès au MODULE « Permis de construire » (module gardé, patron des 6 perm_* de 014). Administrateur : true forcé (permsToutes). DEFAULT false : un collaborateur n''y a accès que si Arno le coche.';
COMMENT ON COLUMN admin_utilisateur.perm_permis_modif IS 'RATT-EDIT — SOUS-DROIT « modifier un permis APRÈS validation » (édition altitude/emprise + revalidation dans Rattachement). N''est PAS un module (aucune entrée de menu) : garde les seuls gestes de modif, de façon CONTEXTUELLE (dossier déjà en permis_projection). DEFAULT false pour tous ; administrateur : true forcé.';

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- PARTIE 2 — GEL DÉTAIL (append-only versionné, sœurs de permis_gel_bati/permis_gel_parcelle ; gabarit 169).
--   gel_id → permis_gel(id) : FK interne au registre immuable (parent jamais supprimé). corps_id / emprise_id : PAS de FK (référence
--   HISTORIQUE — la preuve survit à la suppression/soft-delete de la ligne de travail source ; un ON DELETE serait un UPDATE interdit).
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- Détail SOMMET figé d'une version : une ligne par corps de bâtiment, valeur + marqueurs de validation copiés de permis_corps_batiment.
CREATE TABLE IF NOT EXISTS permis_gel_corps (
  id                              bigserial   PRIMARY KEY,
  gel_id                          bigint      NOT NULL REFERENCES permis_gel(id),  -- FK interne au registre immuable
  corps_id                        bigint,                                          -- référence historique (PAS de FK : survit à la suppression du corps)
  altitude_sommet_ngf             numeric,                                         -- copie figée du sommet (celui qu'une modif écraserait)
  altitude_sommet_ngf_origine     text,                                            -- origine figée (saisie/extraite/…)
  altitude_sommet_ngf_confirme_le timestamptz,                                     -- qui/quand de la validation d'altitude, figés
  altitude_sommet_ngf_confirme_par text
);
CREATE INDEX IF NOT EXISTS permis_gel_corps_gel_idx   ON permis_gel_corps (gel_id);
CREATE INDEX IF NOT EXISTS permis_gel_corps_corps_idx ON permis_gel_corps (corps_id);

-- Détail EMPRISE figé d'une version : une ligne par emprise reconstruite (l'ENSEMBLE des emprises du corps → restaurer les suppressions/ajouts).
CREATE TABLE IF NOT EXISTS permis_gel_emprise (
  id           bigserial              PRIMARY KEY,
  gel_id       bigint                 NOT NULL REFERENCES permis_gel(id),          -- FK interne au registre immuable
  emprise_id   bigint,                                                            -- référence historique de la ligne permis_emprise_reconstruite (PAS de FK)
  corps_id     bigint,                                                            -- corps porteur (référence historique, PAS de FK)
  geom         geometry(Geometry, 2154),                                          -- géométrie de BASE figée (miroir exact du type source, générique 2154)
  ajustement   jsonb,                                                             -- delta réversible {tx,ty,rotDeg,echelle,…} figé (appliqué au rendu)
  surface_m2   numeric,
  validee_le   timestamptz,                                                       -- qui/quand de la validation d'emprise, figés
  validee_par  text
);
CREATE INDEX IF NOT EXISTS permis_gel_emprise_gel_idx     ON permis_gel_emprise (gel_id);
CREATE INDEX IF NOT EXISTS permis_gel_emprise_emprise_idx ON permis_gel_emprise (emprise_id);
CREATE INDEX IF NOT EXISTS permis_gel_emprise_gix         ON permis_gel_emprise USING gist (geom);

-- 🔴 GARDE APPEND-ONLY EN BASE — RÉUTILISE la fonction PARTAGÉE permis_gel_append_only() (169, déjà en base : nomme la table via
--    TG_TABLE_NAME, lève restrict_violation sur UPDATE/DELETE/TRUNCATE). On ne la redéfinit PAS (169 en est propriétaire) : on branche
--    seulement les triggers des deux nouvelles tables dessus. On fige une NOUVELLE version, on ne corrige jamais en place.
DROP TRIGGER IF EXISTS permis_gel_corps_no_update_delete ON permis_gel_corps;
CREATE TRIGGER permis_gel_corps_no_update_delete
  BEFORE UPDATE OR DELETE ON permis_gel_corps
  FOR EACH ROW EXECUTE FUNCTION permis_gel_append_only();
DROP TRIGGER IF EXISTS permis_gel_corps_no_truncate ON permis_gel_corps;
CREATE TRIGGER permis_gel_corps_no_truncate
  BEFORE TRUNCATE ON permis_gel_corps
  FOR EACH STATEMENT EXECUTE FUNCTION permis_gel_append_only();

DROP TRIGGER IF EXISTS permis_gel_emprise_no_update_delete ON permis_gel_emprise;
CREATE TRIGGER permis_gel_emprise_no_update_delete
  BEFORE UPDATE OR DELETE ON permis_gel_emprise
  FOR EACH ROW EXECUTE FUNCTION permis_gel_append_only();
DROP TRIGGER IF EXISTS permis_gel_emprise_no_truncate ON permis_gel_emprise;
CREATE TRIGGER permis_gel_emprise_no_truncate
  BEFORE TRUNCATE ON permis_gel_emprise
  FOR EACH STATEMENT EXECUTE FUNCTION permis_gel_append_only();

COMMENT ON TABLE permis_gel_corps   IS 'RATT-EDIT — DÉTAIL append-only : sommet (altitude_sommet_ngf + marqueurs de validation) figé par version de permis_gel. Sœur de permis_gel_bati. Trigger permis_gel_append_only. Rempli à la validation (lot B1), lu pour restaurer la validation d''origine (lot C1).';
COMMENT ON TABLE permis_gel_emprise IS 'RATT-EDIT — DÉTAIL append-only : emprise reconstruite (geom de base + ajustement + surface + marqueurs) figée par version de permis_gel. UNE ligne par emprise → l''ENSEMBLE des emprises d''un corps, pour restaurer aussi les suppressions/ajouts. Sœur de permis_gel_parcelle. Trigger permis_gel_append_only. Rempli lot B1, restauré lot C1.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (s'exécute au lancement — LECTURE SEULE, sauf le bloc de preuve du trigger qui s'auto-annule par exception) :
\echo '>>> ① colonnes de droit ajoutées (attendu : perm_permis, perm_permis_modif, boolean, NOT NULL, default false) :'
SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
 WHERE table_name = 'admin_utilisateur' AND column_name IN ('perm_permis','perm_permis_modif') ORDER BY column_name;
\echo '>>> ② migration (b) : administrateurs cochés (perm_permis=perm_permis_modif=true), collaborateurs décochés :'
SELECT role, count(*) AS comptes,
       count(*) FILTER (WHERE perm_permis)       AS avec_perm_permis,
       count(*) FILTER (WHERE perm_permis_modif) AS avec_perm_permis_modif
  FROM admin_utilisateur GROUP BY role ORDER BY role;
\echo '>>> ③ tables de gel détail créées :'
SELECT to_regclass('public.permis_gel_corps') AS gel_corps, to_regclass('public.permis_gel_emprise') AS gel_emprise;
\echo '>>> ④ triggers append-only (attendus : no_update_delete + no_truncate sur les 2 tables) :'
SELECT tgrelid::regclass AS tbl, tgname FROM pg_trigger
 WHERE tgrelid IN ('permis_gel_corps'::regclass,'permis_gel_emprise'::regclass) AND NOT tgisinternal ORDER BY tbl, tgname;
\echo '>>> ⑤ preuve que le trigger MORD sur permis_gel_corps (INSERT autorisé ; UPDATE et DELETE bloqués ; la ligne de test ne subsiste pas) :'
DO $$
DECLARE v_gel_id bigint;
BEGIN
  BEGIN
    -- INSERT d'un permis_gel de test (append-only autorise l'INSERT), puis d'un détail corps le référençant.
    INSERT INTO permis_gel (dossier_id, version, gele_par) VALUES (0, 999998, 'migration:225 (test trigger)') RETURNING id INTO v_gel_id;
    INSERT INTO permis_gel_corps (gel_id, corps_id, altitude_sommet_ngf) VALUES (v_gel_id, 0, 12.34);
    BEGIN
      UPDATE permis_gel_corps SET altitude_sommet_ngf = 99 WHERE gel_id = v_gel_id;
      RAISE EXCEPTION 'ÉCHEC : l''UPDATE de permis_gel_corps aurait dû être bloqué par le trigger append-only';
    EXCEPTION WHEN restrict_violation THEN RAISE NOTICE 'OK : UPDATE permis_gel_corps bloqué (%).', SQLERRM;
    END;
    BEGIN
      DELETE FROM permis_gel_corps WHERE gel_id = v_gel_id;
      RAISE EXCEPTION 'ÉCHEC : le DELETE de permis_gel_corps aurait dû être bloqué par le trigger append-only';
    EXCEPTION WHEN restrict_violation THEN RAISE NOTICE 'OK : DELETE permis_gel_corps bloqué (%).', SQLERRM;
    END;
    RAISE EXCEPTION '__ROLLBACK_VERIF__';  -- annule les INSERT de test (le DELETE étant bloqué, seule cette voie les annule)
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> '__ROLLBACK_VERIF__' THEN RAISE; END IF;
    RAISE NOTICE 'Vérification trigger terminée (lignes de test annulées, rien ne subsiste).';
  END;
END;
$$;

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 🔙 ROLLBACK (au cas où — additive, donc réversible ; les colonnes de droit peuvent rester sans effet tant que le code A2/A3 ne les lit pas) :
--   psql "$DATABASE_URL" -c "BEGIN; \
--     DROP TABLE IF EXISTS permis_gel_emprise; DROP TABLE IF EXISTS permis_gel_corps; \
--     ALTER TABLE admin_utilisateur DROP COLUMN IF EXISTS perm_permis_modif; \
--     ALTER TABLE admin_utilisateur DROP COLUMN IF EXISTS perm_permis; \
--     COMMIT;"
--   (On ne DROP PAS permis_gel_append_only() : elle appartient à 169 et sert toujours permis_gel/_parcelle/_bati.)
