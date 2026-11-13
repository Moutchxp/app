-- 472_couts_remunerations_associes.sql — MON ESPACE « COÛTS ET CA » (Arno, 13/11/2026) : LE POSTE « RÉMUNÉRATIONS ASSOCIÉS » (FAMILLE VENTE).
--
-- LE BESOIN : un nouveau poste de coût, dans la famille VENTE seulement, juste au-dessus de « Salaires chargés » : une ligne par associé (rattachée à
-- son compte), le montant saisi tel quel, SANS TVA (HT = TTC), et sa case ✓ « complet » du mois. CRITERIMMO et MACJ (MACJ a sa vente).
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL :
--   · `transaction_cout_ligne` accepte le poste `remunerations` : famille `vente` OBLIGATOIRE (jamais calculée, contrairement aux salaires),
--     un compte (l'associé), aucun libellé, jamais de TVA ;
--   · `transaction_cout_validation` accepte le poste `remunerations` (nature « cout », famille vente).
-- AUCUNE ligne existante n'est modifiée (les contraintes sont élargies, rien n'est réécrit). Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE
-- transaction (psql -1). IDEMPOTENTE. Suppose la 451, la 452, la 453 et la 471.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, le poste est affiché à 0 et dit « disponible après la mise à jour de la base
-- (migration 472) » ; rien n'y est enregistré.

ALTER TABLE transaction_cout_ligne DROP CONSTRAINT IF EXISTS transaction_cout_ligne_poste_check;
ALTER TABLE transaction_cout_ligne ADD CONSTRAINT transaction_cout_ligne_poste_check CHECK (poste IN ('salaires', 'autres', 'remunerations'));

ALTER TABLE transaction_cout_ligne DROP CONSTRAINT IF EXISTS transaction_cout_ligne_forme;
ALTER TABLE transaction_cout_ligne ADD CONSTRAINT transaction_cout_ligne_forme
  CHECK ((poste IN ('salaires', 'remunerations') AND compte_id IS NOT NULL AND libelle IS NULL)
      OR (poste = 'autres' AND compte_id IS NULL AND btrim(coalesce(libelle, '')) <> ''));

ALTER TABLE transaction_cout_ligne DROP CONSTRAINT IF EXISTS transaction_cout_ligne_famille_check;
ALTER TABLE transaction_cout_ligne ADD CONSTRAINT transaction_cout_ligne_famille_check
  CHECK ((poste = 'salaires' AND (famille IS NULL OR retire_le IS NOT NULL) AND (famille IS NULL OR famille IN ('vente', 'location', 'gestion')))
      OR (poste = 'autres' AND famille IN ('vente', 'location', 'gestion'))
      OR (poste = 'remunerations' AND famille = 'vente'));
-- `transaction_cout_ligne_tva` (poste = 'autres' OR tva = false) couvre déjà « sans TVA » ; `transaction_cout_ligne_structure` (vente OU CRITERIMMO) aussi.

COMMENT ON COLUMN transaction_cout_ligne.poste IS
  'salaires (par salarié, famille calculée — 453), autres (libellé, TVA au choix), remunerations (« Rémunérations associés » : vente, par associé, sans TVA — 472).';

ALTER TABLE transaction_cout_validation DROP CONSTRAINT IF EXISTS transaction_cout_validation_poste_check;
ALTER TABLE transaction_cout_validation ADD CONSTRAINT transaction_cout_validation_poste_check
  CHECK (poste IN ('salaires', 'autres', 'adhoc', 'monga', 'honoraires', 'gli', 'remunerations'));
ALTER TABLE transaction_cout_validation DROP CONSTRAINT IF EXISTS transaction_cout_validation_poste;
ALTER TABLE transaction_cout_validation ADD CONSTRAINT transaction_cout_validation_poste
  CHECK (poste IN ('salaires', 'autres') OR famille = 'gestion' OR (poste = 'remunerations' AND famille = 'vente'));
ALTER TABLE transaction_cout_validation DROP CONSTRAINT IF EXISTS transaction_cout_validation_nature;
ALTER TABLE transaction_cout_validation ADD CONSTRAINT transaction_cout_validation_nature
  CHECK ((nature = 'cout' AND poste IN ('salaires', 'autres', 'adhoc', 'monga', 'remunerations'))
      OR (nature = 'ca' AND poste IN ('honoraires', 'gli') AND famille = 'gestion' AND societe = 'criterimmo'));
