-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 337 — LOT SYNDIC-BOUTONS-DETACHER-ET-FERMETURE : LE MOTIF D'UNE SUPPRESSION DE SYNDIC
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ARNO : « Supprimer ce syndic pour cause de fermeture définitive » — « syndic et contacts sont marqués supprimés (date,
-- auteur, motif “fermeture définitive”) ». La suppression douce existante portait la date et l'auteur, pas le motif.
--
-- MIGRATION D'AJOUT UNIQUEMENT : deux colonnes nullables, sans valeur par défaut — AUCUNE donnée existante modifiée.
--   · gestion_syndic.supprime_motif
--   · gestion_syndic_contact.retire_motif
-- Idempotente (IF NOT EXISTS).
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE gestion_syndic ADD COLUMN IF NOT EXISTS supprime_motif text;
ALTER TABLE gestion_syndic_contact ADD COLUMN IF NOT EXISTS retire_motif text;
