-- 492_location_mandat_par_bien.sql — 🔴🔴 LE N° DE MANDAT PORTÉ PAR CHAQUE BIEN (Arno, 18/11/2026, « Mandat par bien », lot 1).
--
-- LES DÉCISIONS (Arno, 18/11/2026) : « Le n° de mandat de gestion est porté par CHAQUE BIEN en gestion (dans le formulaire du bien, sous « Bien en
-- gestion ? Oui »). Un même n° peut couvrir plusieurs biens UNIQUEMENT s'ils appartiennent au même propriétaire […] s'il est déjà utilisé par un AUTRE
-- propriétaire → refus avec message clair, sans exception. » ; « Mandat de TRANSACTION (bien en location seule) : même règle que la gestion, porté par
-- chaque bien » ; « Date de signature du mandat : elle suit le bien. » ; « Annexes : elles portent le n° de leur logement, sans champ propre. »
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL : sur chaque bien, pour le mandat de gestion ET pour le mandat de transaction locative, le n° tel que saisi, sa forme
-- de comparaison (écrite par le serveur, `normaliserMandat` — la règle des mandats de vente) et la date de signature ; un index de recherche par forme
-- de comparaison. Le contrôle « même propriétaire » est au serveur (un même n° est PERMIS sur plusieurs biens du même ensemble de propriétaires : pas
-- d'unicité en base). Aucune ligne existante touchée ; les colonnes du propriétaire (372, 379, 397) restent, rien n'est effacé ni renommé.
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE. RECETTE SEULEMENT.
-- ⚠️ Sans elle, le mandat s'enregistre comme avant, sur la fiche des propriétaires.

ALTER TABLE gestion_annuaire_lot ADD COLUMN IF NOT EXISTS mandat_gestion_numero text CHECK (mandat_gestion_numero IS NULL OR btrim(mandat_gestion_numero) <> '');
ALTER TABLE gestion_annuaire_lot ADD COLUMN IF NOT EXISTS mandat_gestion_normalise text CHECK (mandat_gestion_normalise IS NULL OR mandat_gestion_normalise <> '');
ALTER TABLE gestion_annuaire_lot ADD COLUMN IF NOT EXISTS mandat_gestion_signe_le date;
ALTER TABLE gestion_annuaire_lot ADD COLUMN IF NOT EXISTS mandat_transaction_numero text CHECK (mandat_transaction_numero IS NULL OR btrim(mandat_transaction_numero) <> '');
ALTER TABLE gestion_annuaire_lot ADD COLUMN IF NOT EXISTS mandat_transaction_normalise text CHECK (mandat_transaction_normalise IS NULL OR mandat_transaction_normalise <> '');
ALTER TABLE gestion_annuaire_lot ADD COLUMN IF NOT EXISTS mandat_transaction_signe_le date;

CREATE INDEX IF NOT EXISTS gestion_annuaire_lot_mandat_gestion_idx ON gestion_annuaire_lot (mandat_gestion_normalise) WHERE mandat_gestion_normalise IS NOT NULL;
CREATE INDEX IF NOT EXISTS gestion_annuaire_lot_mandat_transaction_idx ON gestion_annuaire_lot (mandat_transaction_normalise) WHERE mandat_transaction_normalise IS NOT NULL;

COMMENT ON COLUMN gestion_annuaire_lot.mandat_gestion_numero IS 'N° de mandat de gestion du bien, tel que saisi (492) ; un même n° seulement sur des biens du même ensemble de propriétaires (contrôle serveur).';
COMMENT ON COLUMN gestion_annuaire_lot.mandat_gestion_normalise IS 'Forme de comparaison du n° de mandat de gestion (normaliserMandat), écrite par le serveur (492).';
COMMENT ON COLUMN gestion_annuaire_lot.mandat_gestion_signe_le IS 'Date de signature du mandat de gestion du bien (492).';
COMMENT ON COLUMN gestion_annuaire_lot.mandat_transaction_numero IS 'N° de mandat de transaction locative du bien, tel que saisi (492) ; même règle que le mandat de gestion.';
COMMENT ON COLUMN gestion_annuaire_lot.mandat_transaction_normalise IS 'Forme de comparaison du n° de mandat de transaction locative (normaliserMandat), écrite par le serveur (492).';
COMMENT ON COLUMN gestion_annuaire_lot.mandat_transaction_signe_le IS 'Date de signature du mandat de transaction locative du bien (492).';
