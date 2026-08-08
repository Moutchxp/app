-- 074_releve_auto.sql — Module VEILLE PERMIS (chantier R7) : RELÈVE AUTOMATIQUE des réponses CRPA.
-- ⚠️ AUCUN nouveau job launchd, AUCUNE nouvelle clé de verrou : la relève s'insère dans le CORPS d'executerVeille (déjà
-- déclenché toutes les 15 min sous CLE_VERROU). Ce fichier ne fait que le SCHÉMA (opt-in + journal). TU NE L'APPLIQUES PAS.
--
-- POURQUOI le JOURNAL releve_run est INDISPENSABLE (pas du confort) : launchd est un agent de SESSION — il ne tourne pas
-- quand la machine est éteinte ou la session fermée. Une alerte « la mairie n'a pas répondu » n'a de sens que si la relève
-- a RÉELLEMENT tourné. Sans ce journal, on ne peut pas distinguer « pas de réponse » de « on n'a pas regardé depuis dix
-- jours ». On grave donc chaque relève réelle (en_cours → ok/erreur) pour dater le dernier passage effectif.
--
-- SÛR : DDL ADDITIVE uniquement (ADD COLUMN IF NOT EXISTS, CREATE TABLE/INDEX IF NOT EXISTS). Aucun DROP, aucun trigger.
-- N'écrit JAMAIS demande.statut. GOLDEN-SAFE (aucun contact moteur/config_scoring/batiment). Idempotent. Un seul BEGIN/COMMIT.
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/074_releve_auto.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer.
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) config_veille : pilotage SANS CODE de la relève automatique (lu au runtime, éditable depuis l'écran Réglages).
--    OPT-IN : releve_active défaut false → la relève automatique ne démarre JAMAIS toute seule (il faut l'activer).
--    Bornes dans les CHECK (lues en direct par parserBornesCheck) — aucune plage recopiée dans le code.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS releve_active boolean NOT NULL DEFAULT false;
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS releve_intervalle_minutes integer NOT NULL DEFAULT 60
  CHECK (releve_intervalle_minutes BETWEEN 15 AND 1440);
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS releve_profil text NOT NULL DEFAULT 'entreprise'
  CHECK (releve_profil IN ('entreprise','personne'));

COMMENT ON COLUMN config_veille.releve_active IS 'Relève automatique des réponses activée ? OPT-IN (défaut false) : sans activation explicite, aucune relève automatique.';
COMMENT ON COLUMN config_veille.releve_intervalle_minutes IS 'Intervalle minimum entre deux relèves automatiques (minutes). La relève est ignorée si le dernier releve_run « ok » est plus récent.';
COMMENT ON COLUMN config_veille.releve_profil IS 'Profil de boîte relevé automatiquement (entreprise | personne).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) releve_run — JOURNAL des relèves RÉELLES (une ligne 'en_cours' AVANT la connexion, mise à jour 'ok'/'erreur' après).
--    Écrit en deux temps pour qu'un plantage brutal laisse quand même une trace. 'ignore' (désactivée / intervalle non
--    écoulé) n'est PAS journalisé par la relève automatique (éviter 96 lignes/jour) ; la valeur reste dans le CHECK.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS releve_run (
  id                 bigserial   PRIMARY KEY,
  demarre_le         timestamptz NOT NULL DEFAULT now(),
  termine_le         timestamptz,
  profil             text        NOT NULL,
  declencheur        text        NOT NULL,
  resultat           text        NOT NULL DEFAULT 'en_cours'
                       CONSTRAINT releve_run_resultat_chk CHECK (resultat IN ('en_cours','ok','erreur','ignore')),
  vus                integer,
  deja_connus        integer,
  hors_perimetre     integer,
  retenus            integer,
  rattaches          integer,
  rebonds_detectes   integer,
  rebonds_rattaches  integer,
  rebonds_etrangers  integer,
  rebonds_appliques  integer,
  enregistrees       integer,
  plafond_atteint    boolean,
  erreur             text
);

COMMENT ON TABLE releve_run IS
  'Journal des relèves RÉELLES des réponses CRPA (chantier R7). INDISPENSABLE : launchd est un agent de session (ne tourne pas machine éteinte) — sans ce journal, impossible de distinguer « la mairie n''a pas répondu » de « on n''a pas relevé depuis dix jours ». Écrit en deux temps (en_cours → ok/erreur).';
COMMENT ON COLUMN releve_run.termine_le IS 'Fin de la relève (le dernier « ok » sert à décider si l''intervalle est écoulé).';

CREATE INDEX IF NOT EXISTS releve_run_demarre_idx ON releve_run (demarre_le DESC);

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--
--   \d releve_run
--   SELECT releve_active, releve_intervalle_minutes, releve_profil FROM config_veille WHERE id = 1;
--
--   -- (a) bornes de l'intervalle + liste fermée du profil, lisibles par parserBornesCheck / l'écran Réglages :
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'config_veille'::regclass AND (conname LIKE '%releve%');
--
--   -- (b) journal : colonnes de compteurs présentes + index :
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'releve_run'
--    AND column_name IN ('demarre_le','termine_le','resultat','vus','retenus','rebonds_rattaches','plafond_atteint','erreur');
--   SELECT indexname FROM pg_indexes WHERE tablename = 'releve_run';
--
--   -- (c) contrôles NÉGATIFs (doivent ÉCHOUER), en transaction annulée :
--   -- BEGIN; UPDATE config_veille SET releve_intervalle_minutes = 5 WHERE id = 1; ROLLBACK;  -- viole le CHECK (min 15)
--   -- BEGIN; UPDATE config_veille SET releve_profil = 'xxx' WHERE id = 1; ROLLBACK;           -- viole la liste fermée
--   -- BEGIN; INSERT INTO releve_run (profil, declencheur, resultat) VALUES ('entreprise','planifie','x'); ROLLBACK; -- viole resultat_chk
