-- 445_transaction_negociateur_nom.sql — LOT CG (Arno, 31/10/2026) : LE PRÉNOM ET LE NOM D'UN NÉGOCIATEUR SANS COMPTE.
--
--   · sur `transaction_negociateur_statut` (la fiche d'un négociateur nommé par un libellé des fichiers, sans compte : migration 444), deux colonnes
--     NEUVES, facultatives : `prenom` et `nom` — l'écran affiche « Prénom NOM » (CATHERINE → Catherine TARRISSE) ; vides : le libellé en prénom.
--   · AUCUNE ligne existante n'est modifiée ; aucune donnée n'est posée. IDEMPOTENTE (rejouable). Pas de BEGIN/COMMIT : la mise à jour
--     l'enveloppe dans UNE transaction. Suppose la 444.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, le libellé s'affiche en prénom (« Catherine ») et la commande refuse d'écrire un nom.

ALTER TABLE transaction_negociateur_statut ADD COLUMN IF NOT EXISTS prenom text;
ALTER TABLE transaction_negociateur_statut ADD COLUMN IF NOT EXISTS nom text;
COMMENT ON COLUMN transaction_negociateur_statut.prenom IS 'Prénom du négociateur sans compte (facultatif) — migration 445.';
COMMENT ON COLUMN transaction_negociateur_statut.nom IS 'Nom du négociateur sans compte (facultatif) — migration 445.';
