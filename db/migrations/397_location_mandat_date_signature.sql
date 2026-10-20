-- 397_location_mandat_date_signature.sql — LOCATION (Arno, 21/10/2026) : LA DATE DE SIGNATURE DES MANDATS.
--
-- LE BESOIN (Arno) : à « Nouveau bien », bloc « Bien en gestion ? », Oui ouvre « Mandat de gestion » (n° et date de signature),
-- Non ouvre « Mandat de transaction locative » (n° et date de signature). Le mandat est rattaché au PROPRIÉTAIRE et au BIEN, en
-- réutilisant les champs existants, sans doublon de structure :
--   · le N° vit déjà sur la fiche propriétaire (`numero_mandat_gestion`, migration 372 ; `numero_mandat_transaction`, 379) ;
--   · le BIEN dit lequel le concerne par sa réponse « Bien en gestion ? » (`gestion_annuaire_lot.en_gestion`, migration 390) :
--     Oui → le mandat de gestion de ses propriétaires, Non → leur mandat de transaction locative ;
--   · il ne manque que la DATE DE SIGNATURE de chacun : deux colonnes facultatives, ici.
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE (ajout seul) : deux colonnes `date` facultatives sur `gestion_annuaire_proprietaire`.
-- Aucune ligne n'est lue, modifiée ni supprimée.
--
-- IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction avec son inscription.

ALTER TABLE gestion_annuaire_proprietaire ADD COLUMN IF NOT EXISTS mandat_gestion_signe_le date;
ALTER TABLE gestion_annuaire_proprietaire ADD COLUMN IF NOT EXISTS mandat_transaction_signe_le date;

COMMENT ON COLUMN gestion_annuaire_proprietaire.mandat_gestion_signe_le IS 'Date de signature du mandat de gestion (n° : numero_mandat_gestion) ; facultative — migration 397.';
COMMENT ON COLUMN gestion_annuaire_proprietaire.mandat_transaction_signe_le IS 'Date de signature du mandat de transaction locative (n° : numero_mandat_transaction) ; facultative — migration 397.';
