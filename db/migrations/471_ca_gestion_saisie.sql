-- 471_ca_gestion_saisie.sql — MON ESPACE « COÛTS ET CA » (Arno, 13/11/2026) : LES ASSOCIÉS SAISISSENT AUSSI LE CA DE LA GESTION.
--
-- LE BESOIN : l'onglet « Les coûts » devient « Coûts et CA ». À côté des coûts du mois, une partie « CA GESTION » (CRITERIMMO seulement) : les
-- honoraires de gestion et les honoraires GLI (garantie de loyers impayés), chacun en HT avec son taux de TVA (20 % par défaut, modifiable) et sa
-- case ✓ « complet » ; le CA global de gestion = leur somme (calculé, jamais stocké).
--
-- 🔴 UNE SEULE COMPTABILITÉ : les honoraires de gestion SONT déjà `transaction_gestion_mois.honoraires_ht` (Suivi CA › Gestion, le CA global) : la
-- saisie du mois écrit LÀ, nulle part ailleurs. Cette migration ajoute seulement, sur la MÊME ligne du mois :
--   · `gli_ht`                 les honoraires GLI HT du mois (NULL : non saisis, 0 €) ;
--   · `honoraires_tva_taux`    le taux de TVA des honoraires de gestion, en % (NULL : 20 %, le taux de toujours — l'historique est inchangé au centime) ;
--   · `gli_tva_taux`           celui des honoraires GLI (NULL : 20 %).
-- Et, pour la case ✓, la table des validations (452) accepte les deux postes du CA (`honoraires`, `gli`), de NATURE « ca » (les postes de coûts
-- restent de nature « cout ») : nature × poste × mois × structure, CRITERIMMO seulement (MACJ ne fait pas de gestion).
--
-- AUCUNE ligne existante n'est modifiée. Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE. Suppose la 433
-- (transaction_gestion_mois, journal) et la 452 (transaction_cout_validation).
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, la partie « CA GESTION » dit « disponible après la mise à jour de la base (migration
-- 471) », rien n'y est enregistré, et tous les calculs restent ceux d'avant.

ALTER TABLE transaction_gestion_mois ADD COLUMN IF NOT EXISTS gli_ht numeric(12,2);
ALTER TABLE transaction_gestion_mois ADD COLUMN IF NOT EXISTS honoraires_tva_taux numeric(5,2);
ALTER TABLE transaction_gestion_mois ADD COLUMN IF NOT EXISTS gli_tva_taux numeric(5,2);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transaction_gestion_mois_gli_ht_positif') THEN
    ALTER TABLE transaction_gestion_mois ADD CONSTRAINT transaction_gestion_mois_gli_ht_positif CHECK (gli_ht IS NULL OR gli_ht >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transaction_gestion_mois_tva_taux') THEN
    ALTER TABLE transaction_gestion_mois ADD CONSTRAINT transaction_gestion_mois_tva_taux
      CHECK ((honoraires_tva_taux IS NULL OR honoraires_tva_taux BETWEEN 0 AND 100) AND (gli_tva_taux IS NULL OR gli_tva_taux BETWEEN 0 AND 100));
  END IF;
END $$;

COMMENT ON COLUMN transaction_gestion_mois.gli_ht IS 'Honoraires GLI (garantie de loyers impayés) HT du mois — CA de gestion (Mon espace › Coûts et CA), migration 471.';
COMMENT ON COLUMN transaction_gestion_mois.honoraires_tva_taux IS 'Taux de TVA (%) des honoraires de gestion du mois ; NULL : 20 % — migration 471.';
COMMENT ON COLUMN transaction_gestion_mois.gli_tva_taux IS 'Taux de TVA (%) des honoraires GLI du mois ; NULL : 20 % — migration 471.';

-- La validation (« complet ») : la nature, puis les postes du CA de gestion.
ALTER TABLE transaction_cout_validation ADD COLUMN IF NOT EXISTS nature text NOT NULL DEFAULT 'cout';
ALTER TABLE transaction_cout_validation DROP CONSTRAINT IF EXISTS transaction_cout_validation_poste_check;
ALTER TABLE transaction_cout_validation ADD CONSTRAINT transaction_cout_validation_poste_check
  CHECK (poste IN ('salaires', 'autres', 'adhoc', 'monga', 'honoraires', 'gli'));
ALTER TABLE transaction_cout_validation DROP CONSTRAINT IF EXISTS transaction_cout_validation_nature;
ALTER TABLE transaction_cout_validation ADD CONSTRAINT transaction_cout_validation_nature
  CHECK ((nature = 'cout' AND poste IN ('salaires', 'autres', 'adhoc', 'monga'))
      OR (nature = 'ca' AND poste IN ('honoraires', 'gli') AND famille = 'gestion' AND societe = 'criterimmo'));
COMMENT ON COLUMN transaction_cout_validation.nature IS
  'cout : un poste de coûts (452) ; ca : un poste du CA de gestion (honoraires, gli — CRITERIMMO seulement), migration 471.';
