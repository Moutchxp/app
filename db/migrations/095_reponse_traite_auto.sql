-- 095_reponse_traite_auto.sql — Module VEILLE PERMIS (chantier T1 lot 2b) : distinguer l'ORIGINE de la fermeture d'une réponse.
-- Problème : la synchro « tous les dossiers statués → réponse traitée » (T1 lot 2a) pose traite_le ; au DÉ-statuage elle
-- rouvrait TOUTE réponse fermée de la demande, y compris une réponse close À LA MAIN via l'action `traiter`. On ajoute un
-- marqueur d'origine : la synchro ferme avec traite_auto=true et ne rouvre QUE ce qu'elle avait fermé ; une fermeture manuelle
-- (traite_auto=false, défaut) n'est JAMAIS rouverte automatiquement. Requiert 073.
--
-- SÛR : ADD COLUMN strictement ADDITIF (booléen NOT NULL DEFAULT false — les lignes existantes prennent false, ce qui est
-- CORRECT : avant T1 aucune fermeture n'était automatique). Aucun DROP, aucun UPDATE de données, aucun CHECK à recréer.
-- N'écrit JAMAIS demande.statut. GOLDEN-SAFE. Un seul BEGIN/COMMIT. Idempotente (ADD COLUMN IF NOT EXISTS). TU NE L'APPLIQUES
-- PAS. Lignes de données réécrites : 0 (défaut constant → métadonnée en PG 11+ ; 0 réponse déjà traitée à ce jour de toute façon).
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/095_reponse_traite_auto.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer.
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

ALTER TABLE demande_reponse ADD COLUMN IF NOT EXISTS traite_auto boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN demande_reponse.traite_auto IS 'T1 : la fermeture (traite_le) est-elle AUTOMATIQUE (tous les dossiers statués, synchroniserTraiteeDemande) ? true = auto (rouverte au dé-statuage) ; false = fermeture MANUELLE via l''action traiter (jamais rouverte automatiquement).';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--
--   \d demande_reponse   -- colonne traite_auto (boolean, NOT NULL, défaut false)
--   SELECT count(*) FILTER (WHERE traite_auto) AS auto, count(*) FILTER (WHERE traite_le IS NOT NULL) AS traitees FROM demande_reponse;
--     -- auto = 0 à l'application (toute fermeture pré-T1 est manuelle)
