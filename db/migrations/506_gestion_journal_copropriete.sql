-- 506_gestion_journal_copropriete.sql — 🔴🔴 LE JOURNAL DES LIENS SYNDIC ↔ COPROPRIÉTÉ (Arno, 20/11/2026, lot « Journal des syndics »).
--
-- LE CONSTAT (production, 20/11) : le syndic CABINET PASCAL TOUBON a été rattaché à la copropriété « 80 rue de Normandie » en le créant (29/10), puis
-- détaché depuis la fiche syndic (20/11) ; aucun des deux gestes n'avait écrit au journal.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL : l'entité « copropriete » est ajoutée à la liste acceptée par le journal (gestion_journal_entite_chk), comme la 419
-- l'a fait pour « location_apporteur » : chaque rattachement, remplacement ou retrait d'un syndic y a sa ligne, rattachée à la copropriété.
-- Déjà présente ⇒ rien. Sans la 506, le code écrit la même ligne à chaque bien de la copropriété (« annuaire_lot ») : rien n'est perdu.
-- Aucune donnée touchée ; aucune reprise du passé (le registre gestion_copropriete_syndic reste la source de l'historique ancien).
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe (psql -1). IDEMPOTENTE : rejouable.

DO $$
DECLARE def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def
    FROM pg_constraint WHERE conname = 'gestion_journal_entite_chk' AND conrelid = 'gestion_journal'::regclass;
  IF def IS NULL THEN
    RAISE EXCEPTION 'La contrainte gestion_journal_entite_chk est introuvable : le module gestion est-il installé ?';
  END IF;
  IF position('''copropriete''' IN def) = 0 THEN
    EXECUTE 'ALTER TABLE gestion_journal DROP CONSTRAINT gestion_journal_entite_chk';
    EXECUTE 'ALTER TABLE gestion_journal ADD CONSTRAINT gestion_journal_entite_chk '
            || replace(def, 'ARRAY[', 'ARRAY[''copropriete''::text, ');
  END IF;
END $$;
