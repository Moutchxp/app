-- 444_transaction_negociateur_statut.sql — LOT BX (Arno, 30/10/2026) : LE STATUT D'UN NÉGOCIATEUR SANS COMPTE (ancien collaborateur des fichiers).
--
--   · Les « TABLEAU DE BORD » nomment des négociateurs par un simple libellé (« CATHERINE », « JULIEN », « FRED »…) qui n'ont AUCUN compte de
--     connexion : leur statut restait « à renseigner », et leur commission n'était pas déduite du reste à l'agence. Arno (30/10/2026) :
--     CATHERINE, JULIEN, ANTOINE, HELENE, JEAN CLAUDE et FRED étaient des négociateurs INDÉPENDANTS (commissions d'agent).
--   · `transaction_negociateur_statut` : une fiche par libellé (normalisé : minuscules, sans accents, espaces réduits), son statut
--     ('associe' | 'salarie' | 'independant'), une note ; AUCUN compte de connexion n'est créé. Elle ne sert que si le libellé ne se
--     rapproche d'AUCUN compte (le compte, quand il existe, fait foi).
--   · Une fiche se retire par `retire_le` (datée, signée), jamais supprimée ; une seule fiche vivante par libellé ; chaque geste au journal
--     (`transaction_journal`, entité « negociateur_statut »).
--   · 🔴 RIEN NE S'EFFACE : ni DELETE ni TRUNCATE sur la table neuve (la fonction de la 433).
-- AUCUNE ligne existante n'est modifiée ; aucune donnée n'est posée. IDEMPOTENTE (rejouable). Pas de BEGIN/COMMIT : la mise à jour
-- l'enveloppe dans UNE transaction. Suppose la 433 et la 434.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, aucun libellé sans compte n'a de statut (« à renseigner », comme avant) et la
-- commande `transaction:statut-negociateur` refuse d'écrire (message clair).

CREATE TABLE IF NOT EXISTS transaction_negociateur_statut (
  id                 bigserial     PRIMARY KEY,
  libelle            text          NOT NULL CHECK (btrim(libelle) <> ''),
  libelle_normalise  text          NOT NULL CHECK (btrim(libelle_normalise) <> ''),
  statut             text          NOT NULL CHECK (statut IN ('associe', 'salarie', 'independant')),
  note               text,
  pose_le            timestamptz   NOT NULL DEFAULT now(),
  pose_par_libelle   text          NOT NULL CHECK (btrim(pose_par_libelle) <> ''),
  retire_le          timestamptz,
  retire_par_libelle text
);
CREATE UNIQUE INDEX IF NOT EXISTS transaction_negociateur_statut_vivant_idx ON transaction_negociateur_statut (libelle_normalise) WHERE retire_le IS NULL;
COMMENT ON TABLE transaction_negociateur_statut IS 'Statut d''un négociateur SANS compte, par libellé des fichiers (migration 444) ; le compte, s''il existe, fait foi ; retirée par retire_le, jamais supprimée.';

ALTER TABLE transaction_journal DROP CONSTRAINT IF EXISTS transaction_journal_entite_check;
ALTER TABLE transaction_journal ADD CONSTRAINT transaction_journal_entite_check
  CHECK (entite IN ('vente', 'vente_ligne', 'retrocession', 'ca_a_rattacher', 'gestion_mois', 'personne', 'negociateur_statut'));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'transaction_negociateur_statut_sans_effacement') THEN
    CREATE TRIGGER transaction_negociateur_statut_sans_effacement BEFORE DELETE ON transaction_negociateur_statut
      FOR EACH ROW EXECUTE FUNCTION transaction_refuser_effacement();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'transaction_negociateur_statut_sans_vidage') THEN
    CREATE TRIGGER transaction_negociateur_statut_sans_vidage BEFORE TRUNCATE ON transaction_negociateur_statut
      FOR EACH STATEMENT EXECUTE FUNCTION transaction_refuser_effacement();
  END IF;
END $$;
