-- 446_transaction_gestion_monga.sql — LOT GE3 (Arno, 31/10/2026) : UNE LIGNE DE COÛT « MONGA » DANS LA GESTION DU MOIS.
--
--   · sur `transaction_gestion_mois` (les montants envoyés chaque mois par le comptable), une colonne NEUVE, facultative : `monga_ht`, le coût
--     MONGA HT du mois, saisi dans « Modifier » entre ADHOC et Salarié. Vide : pas de MONGA (compté 0).
--   · AUCUNE ligne existante n'est modifiée ; aucune donnée n'est posée. IDEMPOTENTE (rejouable). Pas de BEGIN/COMMIT : la mise à jour
--     l'enveloppe dans UNE transaction. Suppose la 433.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, MONGA vaut 0 partout et la saisie d'un MONGA est refusée (motif clair, rien n'est écrit).

ALTER TABLE transaction_gestion_mois ADD COLUMN IF NOT EXISTS monga_ht numeric;
COMMENT ON COLUMN transaction_gestion_mois.monga_ht IS 'Coût MONGA HT du mois (facultatif ; vide = 0) — migration 446.';
