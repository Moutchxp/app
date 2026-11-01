-- 447_transaction_location_salaires.sql — LOT LO11 (Arno, 01/11/2026) : LES SALAIRES CHARGÉS DE LA LOCATION, MOIS PAR MOIS.
--
--   · une table NEUVE `transaction_location_salaires_mois` : le montant des salaires chargés de la LOCATION d'un mois (HT, sans TVA), saisi à la
--     main dans « Suivi CA › Location » (« Saisir / Modifier »), distinct de celui de la Gestion (`transaction_gestion_mois.salarie_ht`). Un mois
--     sans ligne (ou au montant vide) : non saisi. Une ligne retirée (`retire_le`) n'est plus lue ; rien ne s'efface.
--   · le journal de la Transaction accepte l'entité `location_salaires_mois` (liste fermée élargie ; les entités d'avant restent).
--   · AUCUNE ligne existante n'est modifiée ; aucune donnée n'est posée. IDEMPOTENTE (rejouable). Pas de BEGIN/COMMIT : la mise à jour
--     l'enveloppe dans UNE transaction. Suppose la 433.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, aucun mois n'a de salaires chargés (la règle « sans salaires ») et la saisie est
--    refusée (motif clair, rien n'est écrit).

CREATE TABLE IF NOT EXISTS transaction_location_salaires_mois (
  id                 bigserial PRIMARY KEY,
  annee              integer NOT NULL CHECK (annee BETWEEN 2000 AND 2100),
  mois               integer NOT NULL CHECK (mois BETWEEN 1 AND 12),
  salaires_ht        numeric CHECK (salaires_ht IS NULL OR salaires_ht >= 0),
  note               text,
  origine            text NOT NULL DEFAULT 'saisie',
  cree_le            timestamptz NOT NULL DEFAULT now(),
  cree_par_libelle   text,
  modifie_le         timestamptz,
  retire_le          timestamptz,
  retire_par_libelle text
);
CREATE UNIQUE INDEX IF NOT EXISTS transaction_location_salaires_mois_un_par_mois
  ON transaction_location_salaires_mois (annee, mois) WHERE retire_le IS NULL;
COMMENT ON TABLE transaction_location_salaires_mois IS 'Salaires chargés de la Location, par mois (HT, sans TVA) — saisis à la main ; migration 447.';

ALTER TABLE transaction_journal DROP CONSTRAINT IF EXISTS transaction_journal_entite_check;
ALTER TABLE transaction_journal ADD CONSTRAINT transaction_journal_entite_check
  CHECK (entite = ANY (ARRAY['vente', 'vente_ligne', 'retrocession', 'ca_a_rattacher', 'gestion_mois', 'personne', 'negociateur_statut', 'location_salaires_mois']));
