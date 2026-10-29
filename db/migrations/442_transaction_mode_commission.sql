-- 442_transaction_mode_commission.sql — LOT V (Arno, 29/10/2026) : LE MODE DE CHAQUE COMMISSION DE NÉGOCIATEUR.
--
-- DÉCISION D'ARNO (remplace « jamais recalculée sans geste humain ») :
--   · « calculee » (par défaut) : la commission = honoraires de ce côté × taux du négociateur ; elle se recalcule et s'enregistre dès qu'un
--     humain change la répartition, le taux, l'apporteur ou la commission de la vente (journalisé : « recalculée suite à … ») ;
--   · « manuelle » : un montant tapé à la main, conservé tel quel (« saisi à la main — calcul : X € », « Revenir au calcul »).
--   · NULL (toutes les lignes d'avant) : le mode se DÉDUIT — égale au calcul : calculée ; différente : saisie à la main. Aucune ligne
--     existante n'est touchée par cette migration.
--
-- EN AJOUT : une colonne neuve, nullable. Rien n'est effacé, rien n'est réécrit. IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour
-- l'enveloppe dans UNE transaction.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, le mode se déduit toujours (un montant tapé égal au calcul suit alors le calcul).

ALTER TABLE transaction_vente_ligne ADD COLUMN IF NOT EXISTS mode_commission text;
ALTER TABLE transaction_vente_ligne DROP CONSTRAINT IF EXISTS transaction_vente_ligne_mode_commission_check;
ALTER TABLE transaction_vente_ligne ADD CONSTRAINT transaction_vente_ligne_mode_commission_check CHECK (mode_commission IS NULL OR mode_commission IN ('calculee', 'manuelle'));
COMMENT ON COLUMN transaction_vente_ligne.mode_commission IS
  'Commission de négociateur : calculee (honoraires du côté × taux, suit la répartition) ou manuelle (montant tapé, conservé) — migration 442 ; NULL : déduit (égale au calcul : calculée).';
