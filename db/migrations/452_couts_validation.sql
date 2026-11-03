-- 452_couts_validation.sql — MON ESPACE « LES COÛTS », LOT 3 (Arno, 03/11/2026, décisions C16 / C17) : « SAISIR LES COÛTS DU MOIS » — UN POSTE VALIDÉ.
--
-- LE BESOIN : la page « Saisir les coûts du mois » dit, par bloc et en tout, « complet / à compléter ». Un poste saisi est COMPLET quand sa valeur du
-- mois (0 compris) a été EXPLICITEMENT validée : il faut le noter quelque part — d'où cette table, la seule nécessité de ce lot. Elle sert aussi le
-- rappel (C17) : tant qu'un poste du mois précédent n'est pas validé, l'onglet « Les coûts » porte « Coûts d'octobre à saisir ».
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL : `transaction_cout_validation` (structure, famille, poste, mois, qui, quand ; retirée par `retire_le`, jamais
-- effacée), une seule validation vivante par (structure, famille, poste, mois) ; le journal de la Transaction accepte l'entité « cout_validation ».
-- AUCUNE ligne existante n'est modifiée. IDEMPOTENTE (rejouable). Pas de BEGIN/COMMIT. Suppose la 433 (journal) et la 451.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, la page enregistre les montants et dit « la validation sera disponible après la mise à jour
-- (migration 452) » ; aucun rappel n'est affiché.

CREATE TABLE IF NOT EXISTS transaction_cout_validation (
  id                  bigserial    PRIMARY KEY,
  societe             text         NOT NULL CHECK (societe IN ('criterimmo', 'macj')),
  famille             text         NOT NULL CHECK (famille IN ('vente', 'location', 'gestion')),
  poste               text         NOT NULL CHECK (poste IN ('salaires', 'autres', 'adhoc', 'monga')),
  annee               integer      NOT NULL CHECK (annee BETWEEN 2000 AND 2100),
  mois                integer      NOT NULL CHECK (mois BETWEEN 1 AND 12),
  valide_le           timestamptz  NOT NULL DEFAULT now(),
  valide_par_libelle  text         NOT NULL CHECK (btrim(valide_par_libelle) <> ''),
  retire_le           timestamptz,
  retire_par_libelle  text,
  CONSTRAINT transaction_cout_validation_structure CHECK (famille = 'vente' OR societe = 'criterimmo'),
  CONSTRAINT transaction_cout_validation_poste CHECK (poste IN ('salaires', 'autres') OR famille = 'gestion')
);
CREATE UNIQUE INDEX IF NOT EXISTS transaction_cout_validation_vivante_idx
  ON transaction_cout_validation (societe, famille, poste, annee, mois) WHERE retire_le IS NULL;
COMMENT ON TABLE transaction_cout_validation IS
  'Les postes de coûts validés pour un mois (« Saisir les coûts du mois », migration 452) ; jamais effacés : retire_le ; journalisés (transaction_journal, cout_validation).';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'transaction_cout_validation_sans_effacement') THEN
    CREATE TRIGGER transaction_cout_validation_sans_effacement BEFORE DELETE ON transaction_cout_validation FOR EACH ROW EXECUTE FUNCTION transaction_refuser_effacement();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'transaction_cout_validation_sans_vidage') THEN
    CREATE TRIGGER transaction_cout_validation_sans_vidage BEFORE TRUNCATE ON transaction_cout_validation FOR EACH STATEMENT EXECUTE FUNCTION transaction_refuser_effacement();
  END IF;
END $$;

ALTER TABLE transaction_journal DROP CONSTRAINT IF EXISTS transaction_journal_entite_check;
ALTER TABLE transaction_journal ADD CONSTRAINT transaction_journal_entite_check
  CHECK (entite = ANY (ARRAY['vente', 'vente_ligne', 'retrocession', 'ca_a_rattacher', 'gestion_mois', 'personne', 'negociateur_statut', 'location_salaires_mois',
                             'cout_ligne', 'cout_validation']));
