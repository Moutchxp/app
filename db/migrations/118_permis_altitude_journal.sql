-- 118_permis_altitude_journal.sql — Module VEILLE PERMIS (chantier FUS-3f) : REGISTRE APPEND-ONLY des altitudes, À VALEUR DE PREUVE.
--
-- ⚠️ POURQUOI (exigence d'Arno) : quand un permis injecte une altitude et ÉCRASE la valeur LiDAR, on ne doit perdre AUCUNE donnée
-- LiDAR. Or aujourd'hui :
--   · permis_polygone_altitude.altitude_lidar_refige est UNE SEULE case, RÉÉCRITE à chaque cycle (injection → mesure → injection…)
--     → ce n'est pas un historique, c'est un presse-papier à une valeur ;
--   · l'import BD TOPO RECHARGE la table `batiment` (hors dépôt, sans table de millésime) → un millésime antérieur écrasé n'existe
--     plus nulle part chez nous ;
--   · permis_bati_snapshot ne fige qu'UN instant (l'analyse du permis), pas une chronique.
-- Ce registre garde, pour d'hypothétiques justifications juridiques, la SUITE COMPLÈTE des altitudes d'un cleabs (valeur, origine,
-- provenance, date, cause), extractible polygone par polygone ou parcelle par parcelle (cf. app/lib/permis/exportAltitudes.ts).
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗
-- ║ 🔴 APPEND-ONLY — C'EST UNE PIÈCE DE PREUVE. JAMAIS d'UPDATE, JAMAIS de DELETE, JAMAIS de TRUNCATE.                         ║
-- ║ On ne CORRIGE pas une ligne : on ÉMET une nouvelle ligne. Cette immutabilité est GARANTIE EN BASE par un trigger (plus     ║
-- ║ bas) qui lève une exception sur UPDATE / DELETE / TRUNCATE — un test de dépôt ne protégerait que le dépôt, pas un psql ni   ║
-- ║ un script tiers. Escape-hatch délibéré (jamais en routine) : DROP le trigger sciemment, à ses risques.                     ║
-- ║ PROVENANCE OBLIGATOIRE : une ligne sans provenance ne prouve rien. `source_type` + `source_millesime` portent l'édition ;  ║
-- ║ si le millésime est INCONNU (la couche `batiment` n'a AUCUNE étiquette d'édition), on écrit littéralement 'inconnu' —      ║
-- ║ JAMAIS une date supposée. `source_date` ne reçoit qu'une date RÉELLE par objet (batiment.date_modification), sinon NULL.   ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝
--
-- PÉRIMÈTRE BORNÉ : le registre ne suit QUE les cleabs des empreintes de permis (cf. importBdTopoSuivis) — jamais le bâti des
-- quatre départements. Pas de FK sur `dossier_id` : la preuve doit SURVIVRE à une purge du dossier, et un ON DELETE SET NULL
-- déclencherait un UPDATE… interdit par le trigger append-only.
--
-- SÛR : DDL strictement ADDITIVE (CREATE TABLE / FUNCTION / TRIGGER / INDEX, tous IF NOT EXISTS ou OR REPLACE ; DROP TRIGGER IF
-- EXISTS seulement sur nos propres triggers avant re-création idempotente). Aucune colonne existante touchée. Ne touche NI le moteur
-- de verdict SVAV NI le golden. Idempotente. Un seul BEGIN/COMMIT. Requiert `sitadel_dossier` (047), `permis_empreinte` (113),
-- `batiment`. Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/118_permis_altitude_journal.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS.

BEGIN;

-- REGISTRE — une ligne par CHANGEMENT d'altitude d'un cleabs (append-only, à valeur de preuve).
CREATE TABLE IF NOT EXISTS permis_altitude_journal (
  id                  bigserial   PRIMARY KEY,
  cleabs              text        NOT NULL,                        -- identité BD TOPO du polygone concerné
  altitude_ngf        numeric,                                     -- altitude EFFECTIVE après ce changement (NGF absolu) ; NULL = mesure absente à cette édition (fait, pas vide muet)
  origine             text        NOT NULL
                        CONSTRAINT permis_altitude_journal_origine_chk CHECK (origine IN ('lidar','permis')),
  cause               text        NOT NULL                         -- ce qui a PROVOQUÉ l'enregistrement (liste fermée)
                        CONSTRAINT permis_altitude_journal_cause_chk CHECK (cause IN ('import','injection','retour_arriere','ecrasement_lidar')),
  source_type         text,                                        -- provenance : 'bdtopo' | 'lidar_hd' | 'permis' (convention ; libre pour futures sources)
  source_millesime    text,                                        -- étiquette d'édition de la source, ou 'inconnu' EXPLICITE — JAMAIS une date supposée
  source_date         timestamptz,                                 -- date RÉELLE par objet (batiment.date_modification) quand connue ; NULL sinon
  dossier_id          bigint,                                      -- permis en jeu (PAS de FK : la preuve survit à la purge du dossier ; SET NULL serait un UPDATE interdit)
  altitude_precedente numeric,                                     -- valeur remplacée (lisibilité « était X → devient Y ») ; NULL pour la 1re ligne d'un cleabs
  origine_precedente  text        CONSTRAINT permis_altitude_journal_origine_prec_chk CHECK (origine_precedente IN ('lidar','permis')),
  enregistre_le       timestamptz NOT NULL DEFAULT now(),
  enregistre_par      text,
  note                text                                         -- récit lisible (auditabilité : « on doit pouvoir raconter l'histoire »)
);
CREATE INDEX IF NOT EXISTS permis_altitude_journal_cleabs_idx  ON permis_altitude_journal (cleabs, enregistre_le);
CREATE INDEX IF NOT EXISTS permis_altitude_journal_dossier_idx ON permis_altitude_journal (dossier_id);

-- 🔴 GARDE APPEND-ONLY EN BASE — lève une exception sur toute mutation destructive (pas seulement dans le dépôt : ici, pour de bon).
CREATE OR REPLACE FUNCTION permis_altitude_journal_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'permis_altitude_journal est APPEND-ONLY (pièce de preuve) : % interdit. On ne corrige pas en place — on émet une nouvelle ligne.', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
DROP TRIGGER IF EXISTS permis_altitude_journal_no_update_delete ON permis_altitude_journal;
CREATE TRIGGER permis_altitude_journal_no_update_delete
  BEFORE UPDATE OR DELETE ON permis_altitude_journal
  FOR EACH ROW EXECUTE FUNCTION permis_altitude_journal_append_only();
DROP TRIGGER IF EXISTS permis_altitude_journal_no_truncate ON permis_altitude_journal;
CREATE TRIGGER permis_altitude_journal_no_truncate
  BEFORE TRUNCATE ON permis_altitude_journal
  FOR EACH STATEMENT EXECUTE FUNCTION permis_altitude_journal_append_only();

COMMENT ON TABLE permis_altitude_journal IS 'FUS-3f — REGISTRE APPEND-ONLY des altitudes par cleabs, à VALEUR DE PREUVE. Une ligne par changement (import BD TOPO, injection permis, retour arrière, écrasement par une mesure LiDAR postérieure). 🔴 JAMAIS d''UPDATE/DELETE/TRUNCATE : garanti EN BASE par le trigger permis_altitude_journal_append_only (on émet une nouvelle ligne, on ne corrige pas). Pas de FK dossier_id (la preuve survit à la purge du dossier). Périmètre borné aux cleabs des empreintes de permis. Extraction : app/lib/permis/exportAltitudes.ts.';
COMMENT ON COLUMN permis_altitude_journal.cause IS 'FUS-3f — ce qui a provoqué la ligne (liste FERMÉE) : import (nouvelle édition BD TOPO / ligne de départ LiDAR) | injection (permis) | retour_arriere (restauration de la LiDAR refigée) | ecrasement_lidar (mesure LiDAR postérieure qui écrase une altitude permis).';
COMMENT ON COLUMN permis_altitude_journal.source_millesime IS 'FUS-3f — PROVENANCE OBLIGATOIRE : étiquette d''édition de la source. Si inconnue (la couche batiment n''a AUCUNE étiquette d''édition), écrire littéralement ''inconnu'' — JAMAIS une date supposée. Une ligne de preuve sans provenance ne prouve rien.';
COMMENT ON COLUMN permis_altitude_journal.source_date IS 'FUS-3f — date RÉELLE par objet (batiment.date_modification) quand elle existe ; NULL sinon. N''est JAMAIS une date d''édition supposée (cf. source_millesime).';
COMMENT ON COLUMN permis_altitude_journal.dossier_id IS 'FUS-3f — permis en jeu (origine ''permis'', ou permis annulé par une mesure LiDAR). PAS de FK : la preuve doit survivre à la purge du dossier, et un ON DELETE SET NULL serait un UPDATE interdit par le trigger append-only.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (S'EXÉCUTE quand tu lances le fichier — AFFICHE le résultat) :
\echo '>>> table du registre + colonnes :'
SELECT column_name, udt_name FROM information_schema.columns WHERE table_name = 'permis_altitude_journal' ORDER BY ordinal_position;
\echo '>>> CHECK cause (liste fermée) + origine :'
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname IN ('permis_altitude_journal_cause_chk','permis_altitude_journal_origine_chk') ORDER BY conname;
\echo '>>> triggers append-only (attendus : no_update_delete, no_truncate) :'
SELECT tgname FROM pg_trigger WHERE tgrelid = 'permis_altitude_journal'::regclass AND NOT tgisinternal ORDER BY tgname;
\echo '>>> preuve que le trigger MORD (le DELETE doit être bloqué ; AUCUNE ligne de test ne subsiste) :'
DO $$
BEGIN
  -- Sous-transaction plpgsql : tout ce qui s'y passe est ANNULÉ par le RAISE final → la ligne de test ne subsiste pas
  -- (elle ne pourrait de toute façon PAS être supprimée, le DELETE étant bloqué — d'où le rollback par exception).
  BEGIN
    INSERT INTO permis_altitude_journal (cleabs, altitude_ngf, origine, cause, source_type, source_millesime, enregistre_par)
      VALUES ('__TEST_TRIGGER__', 10, 'lidar', 'import', 'bdtopo', 'inconnu', 'migration:118');
    BEGIN
      DELETE FROM permis_altitude_journal WHERE cleabs = '__TEST_TRIGGER__';
      RAISE EXCEPTION 'ÉCHEC : le DELETE aurait dû être bloqué par le trigger append-only';
    EXCEPTION WHEN restrict_violation THEN
      RAISE NOTICE 'OK : DELETE bloqué par le trigger append-only (%).', SQLERRM;
    END;
    RAISE EXCEPTION '__ROLLBACK_VERIF__';   -- annule l'INSERT de test (rollback de cette sous-transaction)
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> '__ROLLBACK_VERIF__' THEN RAISE; END IF;
    RAISE NOTICE 'Vérification trigger terminée (ligne de test annulée, rien ne subsiste).';
  END;
END;
$$;
