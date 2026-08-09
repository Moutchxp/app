-- 082_acheminement_relance.sql — Module VEILLE PERMIS (chantier W1) : TRAÇABILITÉ de l'émission d'une RELANCE. On ajoute à
-- demande_acheminement de quoi distinguer une émission de relance d'une émission initiale, pour que l'envoi effectif des
-- relances (chantier W1, code séparé) laisse une preuve d'émission propre. TU NE L'APPLIQUES PAS. Requiert 076 + 081.
--
-- SÛR : DDL strictement ADDITIVE (ADD COLUMN IF NOT EXISTS nullable + CREATE INDEX IF NOT EXISTS). FK NULLABLE vers
-- demande_relance(id) (stable). Aucun DROP, aucun UPDATE, aucun trigger. N'écrit JAMAIS demande.statut. GOLDEN-SAFE
-- (aucun contact moteur/config_scoring/batiment → golden 29.107259068449615 intact). Idempotente. Un seul BEGIN/COMMIT.
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/082_acheminement_relance.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer.
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- demande_acheminement.relance_id — quelle RELANCE cette émission concerne. NULL = émission INITIALE de la demande (le cas
-- historique, inchangé) ; NON-NULL = émission d'une RELANCE (demande_relance.id). Une même demande peut donc porter
-- plusieurs lignes d'acheminement : l'initiale (relance_id NULL) puis, un mois plus tard, la relance (relance_id renseigné)
-- — « un enregistrement par ÉMISSION » (cf. S37/070). Le statut de la DEMANDE, comme celui de la RELANCE, vit ailleurs.
-- ⚠️ RAPPEL JURIDIQUE (identique à S37) : envoye_le prouve l'ÉMISSION, JAMAIS la RÉCEPTION. Cette colonne ne change rien
-- à cette règle : elle dit seulement DE QUOI l'émission est la preuve (demande initiale vs relance).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE demande_acheminement ADD COLUMN IF NOT EXISTS relance_id bigint REFERENCES demande_relance(id);

COMMENT ON COLUMN demande_acheminement.relance_id IS
  'Émission d''une RELANCE (demande_relance.id) ; NULL = émission INITIALE de la demande. Une demande peut porter l''émission initiale (NULL) puis celle de sa relance (non-NULL). envoye_le prouve l''ÉMISSION, jamais la RÉCEPTION (cf. S37).';

-- Index : on filtrera/rattachera les émissions par relance (suivi, réémission), comme demande_acheminement_demande_idx pour la demande.
CREATE INDEX IF NOT EXISTS demande_acheminement_relance_idx ON demande_acheminement (relance_id);

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--
--   \d demande_acheminement   -- doit lister la colonne relance_id (bigint, NULL) + l'index demande_acheminement_relance_idx
--   SELECT count(*) FILTER (WHERE relance_id IS NULL) AS initiales, count(*) FILTER (WHERE relance_id IS NOT NULL) AS relances
--     FROM demande_acheminement;   -- toute ligne existante reste 'initiale' (relance_id NULL) : additif, aucune donnée perdue
--
--   -- Contrôle NÉGATIF (doit ÉCHOUER), en transaction annulée : FK vers une relance inexistante refusée.
--   -- BEGIN; UPDATE demande_acheminement SET relance_id = 999999999 WHERE false; ROLLBACK;  -- (aucune ligne ciblée : illustratif)
