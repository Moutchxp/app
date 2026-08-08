-- 078_alertes.sql — Module VEILLE PERMIS (chantier R8) : ALERTES par e-mail (UN récapitulatif par jour).
-- ⚠️ Principe : jamais un e-mail par événement (illisible au bout d'une semaine) — un SEUL récapitulatif quotidien, envoyé
-- SEULEMENT s'il y a quelque chose à dire. Opt-in. AUCUN nouveau job launchd, AUCUNE nouvelle clé de verrou (l'envoi passe
-- par le corps d'executerVeille, déjà sous CLE_VERROU). N'écrit JAMAIS demande.statut. TU NE L'APPLIQUES PAS.
-- Prérequis d'ordre : 077 appliquée avant.
--
-- SÛR : DDL ADDITIVE (ADD COLUMN / CREATE TABLE|INDEX IF NOT EXISTS). Aucun DROP, aucun trigger. GOLDEN-SAFE. Un seul BEGIN/COMMIT.
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/078_alertes.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer.
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) config_veille : pilotage SANS CODE des alertes (lu au runtime, éditable depuis l'écran Réglages — exigence forte).
--    OPT-IN : alerte_active défaut false. alerte_email vide = aucune alerte possible même si active. alerte_heure_locale =
--    l'heure locale à partir de laquelle le récapitulatif du jour peut partir (bornes dans le CHECK, lues par l'écran).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS alerte_active boolean NOT NULL DEFAULT false;
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS alerte_email text NOT NULL DEFAULT '';
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS alerte_heure_locale integer NOT NULL DEFAULT 8
  CHECK (alerte_heure_locale BETWEEN 0 AND 23);

COMMENT ON COLUMN config_veille.alerte_active IS 'Alertes e-mail activées ? OPT-IN (défaut false).';
COMMENT ON COLUMN config_veille.alerte_email IS 'Destinataire du récapitulatif quotidien. Vide = aucune alerte possible, même si activée.';
COMMENT ON COLUMN config_veille.alerte_heure_locale IS 'Heure locale (0-23) à partir de laquelle le récapitulatif du jour peut être envoyé.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) alerte_run — JOURNAL des alertes, écrit en DEUX TEMPS (en_cours → envoyee/erreur), 'rien_a_dire' si le récapitulatif
--    est vide. Sert d'ANTI-DOUBLON à double titre : (a) au plus une alerte 'envoyee'/'rien_a_dire' par jour ; (b) la borne
--    du prochain récapitulatif = la dernière alerte 'envoyee' → on ne rapporte QUE ce qui a changé depuis (jamais deux fois).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerte_run (
  id           bigserial   PRIMARY KEY,
  demarre_le   timestamptz NOT NULL DEFAULT now(),
  envoye_le    timestamptz,
  destinataire text,
  sujet        text,
  corps        text,
  resultat     text        NOT NULL DEFAULT 'en_cours'
                 CONSTRAINT alerte_run_resultat_chk CHECK (resultat IN ('en_cours','envoyee','rien_a_dire','erreur')),
  erreur       text
);

COMMENT ON TABLE alerte_run IS
  'Journal des alertes e-mail quotidiennes (chantier R8). ANTI-DOUBLON : au plus une alerte ''envoyee''/''rien_a_dire'' par jour, et la dernière ''envoyee'' sert de BORNE au récapitulatif suivant (on ne rapporte que ce qui a changé depuis). Écrit en deux temps (en_cours → envoyee/erreur).';

CREATE INDEX IF NOT EXISTS alerte_run_demarre_idx ON alerte_run (demarre_le DESC);

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--
--   \d alerte_run
--   SELECT alerte_active, alerte_email, alerte_heure_locale FROM config_veille WHERE id = 1;
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'config_veille'::regclass AND conname LIKE '%alerte%';
--   SELECT indexname FROM pg_indexes WHERE tablename = 'alerte_run';
--
--   -- Contrôles NÉGATIFs (doivent ÉCHOUER), en transaction annulée :
--   -- BEGIN; UPDATE config_veille SET alerte_heure_locale = 24 WHERE id = 1; ROLLBACK;  -- viole le CHECK (max 23)
--   -- BEGIN; UPDATE config_veille SET alerte_heure_locale = -1 WHERE id = 1; ROLLBACK;  -- viole le CHECK (min 0)
--   -- BEGIN; INSERT INTO alerte_run (resultat) VALUES ('x'); ROLLBACK;                  -- viole alerte_run_resultat_chk
