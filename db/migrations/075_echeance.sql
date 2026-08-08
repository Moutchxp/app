-- 075_echeance.sql — Module VEILLE PERMIS (chantier R6) : ÉCHÉANCE d'un mois + RELÈVE APPROFONDIE ciblée.
-- ⚠️ Ce chantier ne génère AUCUNE relance et N'ENVOIE AUCUNE alerte : il calcule seulement un état d'échéance et permet de
-- REGARDER MIEUX (relève approfondie ciblée). AUCUN nouveau job launchd, AUCUNE nouvelle clé de verrou (tout passe par le
-- corps d'executerVeille, déjà sous CLE_VERROU). N'écrit JAMAIS demande.statut. TU NE L'APPLIQUES PAS.
--
-- Prérequis d'ordre : appliquer 074 (table releve_run) AVANT ce fichier. Additive et idempotente : rejouable sans effet.
--
-- SÛR : DDL ADDITIVE uniquement (ADD COLUMN IF NOT EXISTS). Aucun DROP, aucun trigger, aucune donnée modifiée.
-- GOLDEN-SAFE (aucun contact moteur/config_scoring/bâtiment). Un seul BEGIN/COMMIT.
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/075_echeance.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer.
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) releve_run : demande_id — renseigné UNIQUEMENT pour une relève APPROFONDIE ciblée (declencheur 'approfondi').
--    NULL pour une relève COURANTE (INBOX, tous profils confondus, chantier R7). FK vers demande (même convention que
--    demande_reponse.demande_id, migration 073 : REFERENCES sans ON DELETE).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE releve_run ADD COLUMN IF NOT EXISTS demande_id bigint REFERENCES demande(id);

COMMENT ON COLUMN releve_run.demande_id IS 'Demande visée par une relève APPROFONDIE (declencheur ''approfondi''). NULL pour une relève courante.';

CREATE INDEX IF NOT EXISTS releve_run_demande_idx ON releve_run (demande_id) WHERE demande_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) config_veille : deux réglages pilotables SANS CODE (lus au runtime, éditables depuis l'écran Réglages). Bornes dans
--    les CHECK (lues en direct par parserBornesCheck) — aucune plage recopiée dans le code.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS echeance_alerte_jours integer NOT NULL DEFAULT 7
  CHECK (echeance_alerte_jours BETWEEN 1 AND 30);
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS releve_fraicheur_heures integer NOT NULL DEFAULT 48
  CHECK (releve_fraicheur_heures BETWEEN 1 AND 720);

COMMENT ON COLUMN config_veille.echeance_alerte_jours IS 'Combien de jours avant l''échéance d''un mois on considère qu''elle est « proche ».';
COMMENT ON COLUMN config_veille.releve_fraicheur_heures IS 'Au-delà de cette ancienneté de la dernière relève « ok », l''état d''échéance devient « indéterminé » : on n''annonce jamais un silence non vérifié.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--
--   \d releve_run
--   SELECT echeance_alerte_jours, releve_fraicheur_heures FROM config_veille WHERE id = 1;
--
--   -- (a) colonne demande_id + index partiel :
--   SELECT column_name, is_nullable FROM information_schema.columns
--    WHERE table_name = 'releve_run' AND column_name = 'demande_id';
--   SELECT indexname FROM pg_indexes WHERE tablename = 'releve_run' AND indexname = 'releve_run_demande_idx';
--
--   -- (b) bornes des deux réglages, lisibles par parserBornesCheck / l'écran Réglages :
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'config_veille'::regclass AND (conname LIKE '%echeance%' OR conname LIKE '%fraicheur%');
--
--   -- (c) contrôles NÉGATIFs (doivent ÉCHOUER), en transaction annulée :
--   -- BEGIN; UPDATE config_veille SET echeance_alerte_jours = 0 WHERE id = 1; ROLLBACK;   -- viole le CHECK (min 1)
--   -- BEGIN; UPDATE config_veille SET echeance_alerte_jours = 31 WHERE id = 1; ROLLBACK;  -- viole le CHECK (max 30)
--   -- BEGIN; UPDATE config_veille SET releve_fraicheur_heures = 0 WHERE id = 1; ROLLBACK; -- viole le CHECK (min 1)
--   -- BEGIN; UPDATE config_veille SET releve_fraicheur_heures = 721 WHERE id = 1; ROLLBACK; -- viole le CHECK (max 720)
