-- 435_transaction_prix_vente.sql — TUILE « TRANSACTION », LOT E (Arno, 27/10/2026) : LE PRIX DE VENTE D'UN COMPROMIS OU D'UNE VENTE.
--
-- DÉCISION D'ARNO : un champ « Prix de vente (€) », facultatif, dans le formulaire du compromis et de la vente ; montré sur la carte
-- compacte de l'onglet « Compromis ». Journalisé comme les autres champs de la vente (valeur avant / après, « Annuler »).
--
-- EN AJOUT SEUL : une colonne NEUVE et vide sur `transaction_vente`. Aucune ligne existante modifiée. IDEMPOTENTE. Pas de BEGIN/COMMIT :
-- la mise à jour l'enveloppe dans UNE transaction. Suppose la 433.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, le champ est montré grisé (« disponible après la mise à jour (migration
-- 435) »), la carte dit « prix à renseigner », et rien ne lit ni n'écrit la colonne.

ALTER TABLE transaction_vente ADD COLUMN IF NOT EXISTS prix_vente numeric CHECK (prix_vente IS NULL OR prix_vente >= 0);
COMMENT ON COLUMN transaction_vente.prix_vente IS 'Le prix de vente du bien (€), facultatif, saisi à l''écran (migration 435).';
