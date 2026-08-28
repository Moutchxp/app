-- 164_permis_polygone_statut.sql — Module VEILLE PERMIS (chantier RATT-1 point 2) : REGISTRE APPEND-ONLY du STATUT d'un polygone
-- existant vis-à-vis d'un permis (« bâtiment préservé » / « bâtiment détruit »), décidé par l'internaute sur l'onglet Analyse.
--
-- ⚠️ POURQUOI (exigence d'Arno) : la source IGN `batiment.etat_de_l_objet` (« En projet », « En service »…) ne doit JAMAIS être
-- écrite ni effacée par l'interface. Ma DÉCISION (préservé/détruit) est une donnée DISTINCTE de la source, et l'écran doit afficher
-- TOUJOURS les deux CÔTE À CÔTE (ce que dit BD TOPO ET ce que J'AI décidé). Deux cas cadrés :
--   · PRÉSERVÉ : le polygone garde ses données LiDAR quoi qu'il arrive dans le process du permis (définitif). Peut PRIMER sur un
--     « En projet » BD TOPO que je juge erroné — mais la trace « BD TOPO disait En projet » reste lisible (jamais d'écrasement muet).
--   · DÉTRUIT : PRÉVISION (pas un fait constaté) que le polygone disparaîtra de la future parcelle ; à CONFRONTER le jour de la mise
--     à jour de la planche cadastrale. On garde donc l'état BD TOPO du moment pour pouvoir confronter plus tard.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗
-- ║ 🔴 APPEND-ONLY (même logique que 118_permis_altitude_journal) : JAMAIS d'UPDATE/DELETE/TRUNCATE. Révoquer/changer un statut  ║
-- ║ = ÉMETTRE une nouvelle ligne (statut 'revoque' pour annuler). Le STATUT COURANT d'un (dossier, cleabs) = la DERNIÈRE ligne   ║
-- ║ (decide_le DESC). L'HISTORIQUE de mes décisions successives reste (qui a décidé quoi et quand). Garanti EN BASE par trigger. ║
-- ║ `etat_bdtopo_au_moment` = SNAPSHOT de batiment.etat_de_l_objet à l'instant de la décision (la trace de la source ; jamais    ║
-- ║ une réécriture de la source). NULL = état inconnu au moment (fait, pas vide muet).                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝
--
-- SÛR : DDL strictement ADDITIVE (CREATE TABLE / FUNCTION / TRIGGER / INDEX, tous IF NOT EXISTS ou OR REPLACE ; DROP TRIGGER IF
-- EXISTS seulement sur nos propres triggers avant re-création idempotente). Aucune colonne existante touchée. NE touche NI le moteur
-- de verdict SVAV NI le golden. Idempotente. Un seul BEGIN/COMMIT. Requiert `sitadel_dossier` (047). Application MANUELLE (Arno),
-- arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/164_permis_polygone_statut.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS.

BEGIN;

-- REGISTRE — une ligne par DÉCISION de statut d'un polygone existant vis-à-vis d'un permis (append-only).
CREATE TABLE IF NOT EXISTS permis_polygone_statut (
  id                    bigserial   PRIMARY KEY,
  dossier_id            bigint      NOT NULL,                        -- permis en jeu (PAS de FK : la trace survit à la purge ; SET NULL serait un UPDATE interdit)
  cleabs                text        NOT NULL,                        -- identité BD TOPO du polygone concerné
  statut                text        NOT NULL
                          CONSTRAINT permis_polygone_statut_statut_chk CHECK (statut IN ('preserve','detruit','revoque')),
  etat_bdtopo_au_moment text,                                        -- SNAPSHOT de batiment.etat_de_l_objet à l'instant de la décision (trace de la source ; NULL = inconnu au moment)
  decide_par            text,                                        -- qui a décidé
  decide_le             timestamptz NOT NULL DEFAULT now(),          -- quand
  note                  text                                         -- récit lisible optionnel (auditabilité)
);
CREATE INDEX IF NOT EXISTS permis_polygone_statut_courant_idx ON permis_polygone_statut (dossier_id, cleabs, decide_le DESC);
CREATE INDEX IF NOT EXISTS permis_polygone_statut_dossier_idx ON permis_polygone_statut (dossier_id);

-- 🔴 GARDE APPEND-ONLY EN BASE — lève une exception sur toute mutation destructive (pas seulement dans le dépôt : ici, pour de bon).
CREATE OR REPLACE FUNCTION permis_polygone_statut_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'permis_polygone_statut est APPEND-ONLY (trace de décision) : % interdit. On ne corrige pas en place — on émet une nouvelle ligne (statut ''revoque'' pour annuler).', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
DROP TRIGGER IF EXISTS permis_polygone_statut_no_update_delete ON permis_polygone_statut;
CREATE TRIGGER permis_polygone_statut_no_update_delete
  BEFORE UPDATE OR DELETE ON permis_polygone_statut
  FOR EACH ROW EXECUTE FUNCTION permis_polygone_statut_append_only();
DROP TRIGGER IF EXISTS permis_polygone_statut_no_truncate ON permis_polygone_statut;
CREATE TRIGGER permis_polygone_statut_no_truncate
  BEFORE TRUNCATE ON permis_polygone_statut
  FOR EACH STATEMENT EXECUTE FUNCTION permis_polygone_statut_append_only();

COMMENT ON TABLE permis_polygone_statut IS 'RATT-1 (2) — REGISTRE APPEND-ONLY du statut décidé par l''internaute pour un polygone EXISTANT vis-à-vis d''un permis : preserve | detruit | revoque. 🔴 JAMAIS d''UPDATE/DELETE/TRUNCATE (trigger permis_polygone_statut_append_only) : révoquer/changer = émettre une nouvelle ligne. Statut COURANT = dernière ligne (dossier_id, cleabs) par decide_le. etat_bdtopo_au_moment = snapshot de batiment.etat_de_l_objet à la décision (la source IGN n''est JAMAIS touchée ; les deux sont lus côte à côte). ''detruit'' est une PRÉVISION, à confronter à la mise à jour cadastrale.';
COMMENT ON COLUMN permis_polygone_statut.statut IS 'RATT-1 (2) — liste FERMÉE : preserve (le polygone garde ses données LiDAR quoi qu''il arrive, définitif ; peut primer sur un ''En projet'' BD TOPO erroné) | detruit (PRÉVISION de disparition de la PROJECTION de la future parcelle — jamais de la donnée BD TOPO — à confirmer à la mise à jour cadastrale) | revoque (annule la décision précédente ; retour à ''aucun statut décidé'').';
COMMENT ON COLUMN permis_polygone_statut.etat_bdtopo_au_moment IS 'RATT-1 (2) — SNAPSHOT de batiment.etat_de_l_objet (source IGN) à l''instant de la décision. Sert à afficher côte à côte « BD TOPO disait X / j''ai décidé Y » et à confronter plus tard. NULL = état inconnu au moment (fait, pas vide muet). La SOURCE n''est jamais réécrite ici.';
COMMENT ON COLUMN permis_polygone_statut.dossier_id IS 'RATT-1 (2) — permis en jeu. PAS de FK : la trace de décision survit à la purge du dossier, et un ON DELETE SET NULL serait un UPDATE interdit par le trigger append-only.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (S'EXÉCUTE quand tu lances le fichier — AFFICHE le résultat) :
\echo '>>> table + colonnes :'
SELECT column_name, udt_name FROM information_schema.columns WHERE table_name = 'permis_polygone_statut' ORDER BY ordinal_position;
\echo '>>> CHECK statut (liste fermée) :'
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'permis_polygone_statut_statut_chk';
\echo '>>> triggers append-only (attendus : no_update_delete, no_truncate) :'
SELECT tgname FROM pg_trigger WHERE tgrelid = 'permis_polygone_statut'::regclass AND NOT tgisinternal ORDER BY tgname;
\echo '>>> preuve que le trigger MORD (le DELETE doit être bloqué ; AUCUNE ligne de test ne subsiste) :'
DO $$
BEGIN
  BEGIN
    INSERT INTO permis_polygone_statut (dossier_id, cleabs, statut, etat_bdtopo_au_moment, decide_par)
      VALUES (0, '__TEST_TRIGGER__', 'preserve', 'En projet', 'migration:164');
    BEGIN
      DELETE FROM permis_polygone_statut WHERE cleabs = '__TEST_TRIGGER__';
      RAISE EXCEPTION 'ÉCHEC : le DELETE aurait dû être bloqué par le trigger append-only';
    EXCEPTION WHEN restrict_violation THEN
      RAISE NOTICE 'OK : DELETE bloqué par le trigger append-only (%).', SQLERRM;
    END;
    RAISE EXCEPTION '__ROLLBACK_VERIF__';   -- annule l'INSERT de test
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> '__ROLLBACK_VERIF__' THEN RAISE; END IF;
    RAISE NOTICE 'Vérification trigger terminée (ligne de test annulée, rien ne subsiste).';
  END;
END;
$$;
