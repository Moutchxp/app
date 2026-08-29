-- 169_permis_gel_versionne.sql — FIG-1 : rendre le FIGEAGE de la parcelle d'origine OPPOSABLE (versionné + append-only + lié aux décisions).
--
-- ⚠️ POURQUOI : l'état d'origine (parcelle cadastrale, empreinte attendue, footprints du bâti) EST déjà copié — géométrie comprise —
-- dans permis_parcelle.geom_snapshot (113), permis_empreinte.geom (113) et permis_bati_snapshot.geom (114). Mais il n'est PAS opposable :
--   1) AUCUNE protection append-only : figerBatiSnapshot fait DELETE+ré-INSERT (parcellesRepo.ts) et permis_bati_capture est en
--      ON CONFLICT DO UPDATE → une re-capture ÉCRASE l'état antérieur sans trace ; seule la dernière survit.
--   2) AUCUN lien entre un état figé et la décision (rattachement / statut / altitude injectée) qu'il a servie.
--   3) Ces tables n'ont AUCUN trigger, contrairement à permis_altitude_journal (118) et permis_polygone_statut (164), eux protégés.
-- Le verdict à trois phases d'Arno s'appuie DÉLIBÉRÉMENT sur l'ANCIENNE configuration pendant une longue période : ce n'est défendable
-- que si l'état figé est reproductible et infalsifiable. Ce lot le rend tel — SANS toucher au moteur, au verdict, au golden, ni aux écrans.
--
-- ═══ FORME RETENUE : un REGISTRE APPEND-ONLY VERSIONNÉ à CÔTÉ des tables de travail (le patron EXACT permis_altitude_journal / ═══════
--     permis_polygone_statut). Les tables de travail (permis_parcelle éditée à la main, permis_empreinte recalculée, permis_bati_snapshot)
--     RESTENT mutables — elles servent l'affichage « état courant ». La PREUVE immuable vit ici : chaque « figer » APPEND une VERSION
--     horodatée (jamais un écrasement). On NE rend PAS append-only les tables de travail : cela casserait la saisie/le recompute. On copie
--     de VRAIES géométries (pas un hash), comme le snapshot d'origine.
--
--   · permis_gel          — EN-TÊTE, un permis = N versions. version = entier croissant PAR dossier ; UNIQUE(dossier_id, version).
--                           Copie l'empreinte (geom + surface + millésime + complétude) et le RÉSUMÉ du bâti (capture, nb, source).
--   · permis_gel_parcelle — DÉTAIL, une version = N parcelles d'origine (geom_snapshot cadastral figé + millésime).
--   · permis_gel_bati     — DÉTAIL, une version = N footprints de bâti (geom 2D + cleabs + attributs opportunistes).
--
-- ═══ LIEN DÉCISION ↔ VERSION : colonne `gel_id` NULLABLE sur les DEUX registres de décision append-only ══════════════════════════════
--   · permis_altitude_journal.gel_id — l'altitude INJECTÉE depuis un permis (la décision qui alimentera le verdict de phase 2) désigne
--     la VERSION d'état figé sur laquelle elle a été prise. C'est ce qui répond, des années plus tard, à « sur quel état exact ? ».
--   · permis_polygone_statut.gel_id — idem pour la décision de statut (préservé/détruit).
--   NULLABLE + AUCUN backfill : les décisions ANTÉRIEURES à ce lot gardent gel_id = NULL (honnête — « version non tracée »). PAS de FK
--   (comme dossier_id : la preuve survit à la purge, et un ON DELETE SET NULL serait un UPDATE interdit par le trigger append-only).
--
-- ═══ DONNÉES EXISTANTES → VERSION 1 ══════════════════════════════════════════════════════════════════════════════════════════════════
--   Les états déjà figés (mesuré : dossiers 531, 11430, 11434) deviennent la VERSION 1, par COPIE de l'état COURANT des tables de travail.
--   AUCUNE réécriture de leur géométrie de travail, AUCUNE perte. Backfill IDEMPOTENT (WHERE NOT EXISTS).
--
-- SÛR : DDL strictement ADDITIVE (CREATE TABLE/INDEX/TRIGGER IF NOT EXISTS ; ADD COLUMN IF NOT EXISTS ; INSERT gardés WHERE NOT EXISTS).
-- Aucun DROP de table/colonne, aucune colonne existante modifiée, aucune donnée existante réécrite. Ne touche NI le moteur SVAV
-- (app/lib/db, app/lib/svv), NI le verdict, NI le golden Asnières (29.107259068449615), NI config_scoring, NI les écrans. Les 3 gardes
-- ETAN-1 (etancheiteVerdict) restent vertes : ces tables ne sont lues par AUCUN fichier moteur. Une seule transaction. Rejouable.
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/169_permis_gel_versionne.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 1) REGISTRE APPEND-ONLY VERSIONNÉ — EN-TÊTE (un permis = N versions).
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS permis_gel (
  id                     bigserial   PRIMARY KEY,
  dossier_id             bigint      NOT NULL,                       -- permis en jeu (PAS de FK : la preuve survit à la purge du dossier)
  version                integer     NOT NULL,                       -- entier croissant PAR dossier (1, 2, 3, …) ; handle stable pour une décision
  gele_le                timestamptz NOT NULL DEFAULT now(),         -- horodatage du figeage de CETTE version
  gele_par               text,                                       -- qui/quoi a figé (CLI, extraction auto, migration:169)
  -- EMPREINTE ATTENDUE figée (copie de permis_empreinte au moment) — ⚠️ ATTENDUE, PAS la parcelle fusionnée réelle.
  empreinte_geom         geometry(MultiPolygon, 2154),              -- ST_Union des géométries d'origine ; NULL si empreinte incomplète
  empreinte_surface_m2   numeric,
  empreinte_nb_parcelles integer,
  empreinte_complete     boolean,
  empreinte_motif        text,
  empreinte_millesime    text,                                       -- millésime cadastral de l'union
  -- RÉSUMÉ du bâti figé (copie de permis_bati_capture au moment).
  bati_capture           boolean,                                    -- la photo du bâti a-t-elle été prise ?
  bati_nb_batiments      integer,                                    -- NULL si non capturé ; 0 = terrain nu (info valable)
  bati_motif             text,                                       -- si non capturé : pourquoi
  bati_source_millesime  text,                                       -- édition de la couche bâti au moment (best-effort)
  UNIQUE (dossier_id, version)
);
CREATE INDEX IF NOT EXISTS permis_gel_dossier_idx   ON permis_gel (dossier_id, version DESC);
CREATE INDEX IF NOT EXISTS permis_gel_empreinte_gix ON permis_gel USING gist (empreinte_geom);

-- 2) DÉTAIL — parcelles d'origine figées d'une version (geom_snapshot cadastral).
CREATE TABLE IF NOT EXISTS permis_gel_parcelle (
  id                 bigserial   PRIMARY KEY,
  gel_id             bigint      NOT NULL REFERENCES permis_gel(id), -- FK interne au registre immuable (le parent n'est jamais supprimé)
  prefixe            text,
  section            text,
  numero             text,
  idu                text,
  geom_snapshot      geometry(MultiPolygon, 2154),                  -- copie figée de parcelle.geom (Lambert-93)
  snapshot_millesime text
);
CREATE INDEX IF NOT EXISTS permis_gel_parcelle_gel_idx ON permis_gel_parcelle (gel_id);
CREATE INDEX IF NOT EXISTS permis_gel_parcelle_gix     ON permis_gel_parcelle USING gist (geom_snapshot);

-- 3) DÉTAIL — footprints du bâti figés d'une version (2D + cleabs + attributs opportunistes).
CREATE TABLE IF NOT EXISTS permis_gel_bati (
  id                bigserial        PRIMARY KEY,
  gel_id            bigint           NOT NULL REFERENCES permis_gel(id),
  cleabs            text,
  geom              geometry(MultiPolygon, 2154),                    -- footprint 2D figé (ST_Force2D), Lambert-93
  nombre_d_etages   integer,
  altitude_max_toit double precision,
  hauteur           double precision,
  date_modification timestamptz,
  etat_de_l_objet   text,
  usage_1           text,
  usage_2           text
);
CREATE INDEX IF NOT EXISTS permis_gel_bati_gel_idx    ON permis_gel_bati (gel_id);
CREATE INDEX IF NOT EXISTS permis_gel_bati_cleabs_idx ON permis_gel_bati (cleabs);
CREATE INDEX IF NOT EXISTS permis_gel_bati_gix        ON permis_gel_bati USING gist (geom);

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 4) 🔴 GARDE APPEND-ONLY EN BASE — une SEULE fonction partagée par les 3 tables (nomme la table via TG_TABLE_NAME). Modèle EXACT des
--    migrations 118 et 164 : UPDATE / DELETE / TRUNCATE lèvent une exception. On fige une NOUVELLE version, on ne corrige jamais en place.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION permis_gel_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% est APPEND-ONLY (photographie opposable de l''état figé) : % interdit. On fige une nouvelle version, on ne corrige pas en place.', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS permis_gel_no_update_delete ON permis_gel;
CREATE TRIGGER permis_gel_no_update_delete
  BEFORE UPDATE OR DELETE ON permis_gel
  FOR EACH ROW EXECUTE FUNCTION permis_gel_append_only();
DROP TRIGGER IF EXISTS permis_gel_no_truncate ON permis_gel;
CREATE TRIGGER permis_gel_no_truncate
  BEFORE TRUNCATE ON permis_gel
  FOR EACH STATEMENT EXECUTE FUNCTION permis_gel_append_only();

DROP TRIGGER IF EXISTS permis_gel_parcelle_no_update_delete ON permis_gel_parcelle;
CREATE TRIGGER permis_gel_parcelle_no_update_delete
  BEFORE UPDATE OR DELETE ON permis_gel_parcelle
  FOR EACH ROW EXECUTE FUNCTION permis_gel_append_only();
DROP TRIGGER IF EXISTS permis_gel_parcelle_no_truncate ON permis_gel_parcelle;
CREATE TRIGGER permis_gel_parcelle_no_truncate
  BEFORE TRUNCATE ON permis_gel_parcelle
  FOR EACH STATEMENT EXECUTE FUNCTION permis_gel_append_only();

DROP TRIGGER IF EXISTS permis_gel_bati_no_update_delete ON permis_gel_bati;
CREATE TRIGGER permis_gel_bati_no_update_delete
  BEFORE UPDATE OR DELETE ON permis_gel_bati
  FOR EACH ROW EXECUTE FUNCTION permis_gel_append_only();
DROP TRIGGER IF EXISTS permis_gel_bati_no_truncate ON permis_gel_bati;
CREATE TRIGGER permis_gel_bati_no_truncate
  BEFORE TRUNCATE ON permis_gel_bati
  FOR EACH STATEMENT EXECUTE FUNCTION permis_gel_append_only();

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 5) LIEN DÉCISION ↔ VERSION — colonne gel_id NULLABLE sur les deux registres de décision append-only (aucun backfill : NULL = version
--    non tracée pour les décisions antérieures à ce lot). ADD COLUMN sur une table append-only = DDL (ne déclenche PAS le trigger de ligne).
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
ALTER TABLE permis_altitude_journal ADD COLUMN IF NOT EXISTS gel_id bigint;
ALTER TABLE permis_polygone_statut  ADD COLUMN IF NOT EXISTS gel_id bigint;

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 6) BACKFILL VERSION 1 des états déjà figés — COPIE de l'état COURANT des tables de travail. IDEMPOTENT (WHERE NOT EXISTS). Le trigger
--    append-only autorise l'INSERT (il ne bloque que UPDATE/DELETE/TRUNCATE).
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
INSERT INTO permis_gel (dossier_id, version, gele_le, gele_par,
                        empreinte_geom, empreinte_surface_m2, empreinte_nb_parcelles, empreinte_complete, empreinte_motif, empreinte_millesime,
                        bati_capture, bati_nb_batiments, bati_motif, bati_source_millesime)
SELECT u.dossier_id, 1, COALESCE(pbc.capture_le, pe.maj_le, now()), 'migration:169 (backfill v1)',
       pe.geom, pe.surface_m2, pe.nb_parcelles, pe.complete, pe.motif, pe.millesime,
       pbc.capture, pbc.nb_batiments, pbc.motif, pbc.source_millesime
  FROM (SELECT dossier_id FROM permis_empreinte
        UNION SELECT dossier_id FROM permis_bati_capture
        UNION SELECT dossier_id FROM permis_parcelle WHERE geom_snapshot IS NOT NULL) u
  LEFT JOIN permis_empreinte    pe  ON pe.dossier_id  = u.dossier_id
  LEFT JOIN permis_bati_capture pbc ON pbc.dossier_id = u.dossier_id
 WHERE NOT EXISTS (SELECT 1 FROM permis_gel g WHERE g.dossier_id = u.dossier_id AND g.version = 1);

-- Détail parcelles de la version 1 (seulement pour les gels backfillés, seulement si aucun détail n'y est encore).
INSERT INTO permis_gel_parcelle (gel_id, prefixe, section, numero, idu, geom_snapshot, snapshot_millesime)
SELECT g.id, pp.prefixe, pp.section, pp.numero, pp.idu, pp.geom_snapshot, pp.snapshot_millesime
  FROM permis_gel g
  JOIN permis_parcelle pp ON pp.dossier_id = g.dossier_id AND pp.role = 'origine'
 WHERE g.version = 1 AND g.gele_par = 'migration:169 (backfill v1)'
   AND NOT EXISTS (SELECT 1 FROM permis_gel_parcelle x WHERE x.gel_id = g.id);

-- Détail bâti de la version 1.
INSERT INTO permis_gel_bati (gel_id, cleabs, geom, nombre_d_etages, altitude_max_toit, hauteur, date_modification, etat_de_l_objet, usage_1, usage_2)
SELECT g.id, pbs.cleabs, pbs.geom, pbs.nombre_d_etages, pbs.altitude_max_toit, pbs.hauteur, pbs.date_modification, pbs.etat_de_l_objet, pbs.usage_1, pbs.usage_2
  FROM permis_gel g
  JOIN permis_bati_snapshot pbs ON pbs.dossier_id = g.dossier_id
 WHERE g.version = 1 AND g.gele_par = 'migration:169 (backfill v1)'
   AND NOT EXISTS (SELECT 1 FROM permis_gel_bati x WHERE x.gel_id = g.id);

COMMENT ON TABLE permis_gel IS 'FIG-1 — REGISTRE APPEND-ONLY VERSIONNÉ de l''état d''origine figé d''un permis (empreinte + résumé bâti). Un permis = N versions (version croissante par dossier). 🔴 JAMAIS d''UPDATE/DELETE/TRUNCATE (trigger permis_gel_append_only) : chaque « figer » APPEND une version, on ne corrige pas en place. Preuve OPPOSABLE : les tables de travail (permis_empreinte / permis_parcelle / permis_bati_snapshot) restent mutables pour l''affichage « état courant », mais aucune capture ne disparaît d''ICI. Détail : permis_gel_parcelle (parcelles) + permis_gel_bati (footprints). Écriture : app/lib/permis/gelRepo.ts (figerVersionGel).';
COMMENT ON COLUMN permis_gel.version IS 'FIG-1 — entier croissant PAR dossier (1, 2, 3, …). Handle STABLE qu''une décision (permis_altitude_journal.gel_id / permis_polygone_statut.gel_id) désigne pour répondre « sur quel état exact ce verdict a-t-il été rendu ».';
COMMENT ON TABLE permis_gel_parcelle IS 'FIG-1 — DÉTAIL append-only : parcelles d''origine figées d''une version (geom_snapshot cadastral + millésime). Trigger permis_gel_append_only.';
COMMENT ON TABLE permis_gel_bati IS 'FIG-1 — DÉTAIL append-only : footprints du bâti figés d''une version (geom 2D + cleabs + attributs opportunistes). Trigger permis_gel_append_only.';
COMMENT ON COLUMN permis_altitude_journal.gel_id IS 'FIG-1 — VERSION d''état figé (permis_gel.id) sur laquelle l''injection a été décidée. NULLABLE, PAS de FK (la preuve survit à la purge ; SET NULL serait un UPDATE interdit). NULL = décision antérieure à FIG-1 (version non tracée).';
COMMENT ON COLUMN permis_polygone_statut.gel_id IS 'FIG-1 — VERSION d''état figé (permis_gel.id) sur laquelle la décision de statut a été prise. NULLABLE, PAS de FK. NULL = décision antérieure à FIG-1.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (S'EXÉCUTE au lancement — LECTURE SEULE, sauf le bloc de preuve du trigger qui s'auto-annule) :
\echo '>>> ① tables créées :'
SELECT to_regclass('public.permis_gel') AS gel, to_regclass('public.permis_gel_parcelle') AS gel_parcelle, to_regclass('public.permis_gel_bati') AS gel_bati;
\echo '>>> ② triggers append-only (attendus : no_update_delete + no_truncate sur les 3 tables) :'
SELECT tgrelid::regclass AS tbl, tgname FROM pg_trigger
 WHERE tgrelid IN ('permis_gel'::regclass,'permis_gel_parcelle'::regclass,'permis_gel_bati'::regclass) AND NOT tgisinternal ORDER BY tbl, tgname;
\echo '>>> ③ colonnes gel_id ajoutées aux registres de décision :'
SELECT table_name, column_name FROM information_schema.columns
 WHERE (table_name, column_name) IN (('permis_altitude_journal','gel_id'),('permis_polygone_statut','gel_id')) ORDER BY table_name;
\echo '>>> ④ backfill v1 : une version 1 par dossier déjà figé (attendu : 531, 11430, 11434) + comptes de détail :'
SELECT g.dossier_id, g.version, g.empreinte_complete, g.bati_nb_batiments,
       (SELECT count(*) FROM permis_gel_parcelle p WHERE p.gel_id = g.id) AS nb_parcelles_figees,
       (SELECT count(*) FROM permis_gel_bati b WHERE b.gel_id = g.id) AS nb_bati_figes,
       (g.empreinte_geom IS NOT NULL) AS a_empreinte_geom
  FROM permis_gel g WHERE g.version = 1 ORDER BY g.dossier_id;
\echo '>>> ⑤ preuve que le trigger MORD (UPDATE et DELETE bloqués ; la ligne de test ne subsiste pas) :'
DO $$
BEGIN
  BEGIN
    INSERT INTO permis_gel (dossier_id, version, gele_par) VALUES (0, 999999, 'migration:169 (test trigger)');
    BEGIN
      UPDATE permis_gel SET version = 1 WHERE dossier_id = 0 AND version = 999999;
      RAISE EXCEPTION 'ÉCHEC : l''UPDATE aurait dû être bloqué par le trigger append-only';
    EXCEPTION WHEN restrict_violation THEN RAISE NOTICE 'OK : UPDATE bloqué par le trigger append-only (%).', SQLERRM;
    END;
    BEGIN
      DELETE FROM permis_gel WHERE dossier_id = 0 AND version = 999999;
      RAISE EXCEPTION 'ÉCHEC : le DELETE aurait dû être bloqué par le trigger append-only';
    EXCEPTION WHEN restrict_violation THEN RAISE NOTICE 'OK : DELETE bloqué par le trigger append-only (%).', SQLERRM;
    END;
    RAISE EXCEPTION '__ROLLBACK_VERIF__';   -- annule l'INSERT de test (le DELETE étant bloqué, seule cette voie l'annule)
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> '__ROLLBACK_VERIF__' THEN RAISE; END IF;
    RAISE NOTICE 'Vérification trigger terminée (ligne de test annulée, rien ne subsiste).';
  END;
END;
$$;

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 🔙 ROLLBACK (au cas où — additive, donc réversible en dropant ce qu'on a créé ; les colonnes gel_id peuvent rester sans effet) :
--   psql "$DATABASE_URL" -c "BEGIN; \
--     DROP TABLE IF EXISTS permis_gel_bati; DROP TABLE IF EXISTS permis_gel_parcelle; DROP TABLE IF EXISTS permis_gel; \
--     DROP FUNCTION IF EXISTS permis_gel_append_only(); \
--     ALTER TABLE permis_altitude_journal DROP COLUMN IF EXISTS gel_id; \
--     ALTER TABLE permis_polygone_statut  DROP COLUMN IF EXISTS gel_id; \
--     COMMIT;"
