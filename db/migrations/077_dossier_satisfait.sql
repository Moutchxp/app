-- 077_dossier_satisfait.sql — Module VEILLE PERMIS (chantier R6c) : SATISFACTION au DOSSIER (réponse partielle).
-- ⚠️ Corrige un défaut de R6/R6b : « répondue » ne doit pas signifier « un message est arrivé » mais « documents obtenus ».
-- Une mairie répond SOUVENT PARTIELLEMENT (2 dossiers sur 5) : la satisfaction se suit donc au DOSSIER, jamais à la demande.
-- Aucun envoi, aucune alerte, demande.statut jamais écrit. TU NE L'APPLIQUES PAS. Prérequis d'ordre : 076 appliquée avant.
--
-- SÛR : DDL ADDITIVE (ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS). Aucun DROP, aucun trigger, aucune donnée
-- modifiée. GOLDEN-SAFE. Un seul BEGIN/COMMIT. Idempotente.
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/077_dossier_satisfait.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer.
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- demande_dossier : à quel moment, comment, et par quelle réponse CHAQUE dossier a été satisfait (pièces obtenues).
--  · satisfait_le  : NULL tant que les pièces ne sont pas obtenues (c'est CE qui reste à réclamer dans une relance) ;
--  · satisfait_par : 'automatique' (n° Sitadel reconnu LITTÉRALEMENT dans une réponse) ou 'manuel' (décision humaine) ;
--  · reponse_id    : la réponse qui a satisfait le dossier (traçabilité). Jamais de démarquage automatique.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE demande_dossier ADD COLUMN IF NOT EXISTS satisfait_le timestamptz;
ALTER TABLE demande_dossier ADD COLUMN IF NOT EXISTS satisfait_par text
  CHECK (satisfait_par IN ('automatique','manuel'));
ALTER TABLE demande_dossier ADD COLUMN IF NOT EXISTS reponse_id bigint REFERENCES demande_reponse(id);

COMMENT ON COLUMN demande_dossier.satisfait_le IS 'Quand les pièces de CE dossier ont été obtenues (NULL = encore à réclamer). La satisfaction se suit au DOSSIER, pas à la demande : une mairie répond souvent partiellement.';
COMMENT ON COLUMN demande_dossier.satisfait_par IS 'Origine du marquage : automatique (n° Sitadel reconnu littéralement dans une réponse) ou manuel.';
COMMENT ON COLUMN demande_dossier.reponse_id IS 'Réponse (demande_reponse) qui a satisfait ce dossier — traçabilité.';

-- Index PARTIEL sur les dossiers ENCORE à obtenir : c'est la question posée à chaque relance (« que reste-t-il à obtenir ? »).
CREATE INDEX IF NOT EXISTS demande_dossier_a_obtenir_idx ON demande_dossier (demande_id) WHERE satisfait_le IS NULL;

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--
--   \d demande_dossier
--   SELECT indexname FROM pg_indexes WHERE tablename = 'demande_dossier' AND indexname = 'demande_dossier_a_obtenir_idx';
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'demande_dossier'::regclass AND contype = 'c';
--
--   -- (a) répartition satisfait / à obtenir (doit tourner) :
--   SELECT count(*) FILTER (WHERE satisfait_le IS NULL) AS a_obtenir,
--          count(*) FILTER (WHERE satisfait_le IS NOT NULL) AS obtenus FROM demande_dossier WHERE actif;
--
--   -- (b) contrôle NÉGATIF (doit ÉCHOUER), en transaction annulée :
--   -- BEGIN; UPDATE demande_dossier SET satisfait_par = 'x' WHERE true; ROLLBACK;  -- viole le CHECK (liste fermée)
