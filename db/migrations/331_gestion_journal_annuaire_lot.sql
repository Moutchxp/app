-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 331 — LOT SYNDIC-RETIRER-DE-LA-RESIDENCE : LE JOURNAL ACCEPTE L'ENTITÉ « annuaire_lot »
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ARNO : au retrait d'un syndic d'une copropriété, « une ligne de journal par lot (“Syndic X retiré de la
-- copropriété …”) ». Le journal du module n'accepte qu'une liste fermée d'entités (`gestion_journal_entite_chk`) ;
-- un lot de l'annuaire n'y figurait pas. Cette migration y AJOUTE « annuaire_lot » (entite_id = gestion_annuaire_lot.id).
--
-- 🔴 ON AJOUTE À LA LISTE EXISTANTE, ON NE LA RÉÉCRIT PAS — la règle posée par la 260 : on lit la contrainte en place
-- et on y insère la valeur, ce qui rend l'ordre d'application indifférent et le geste réexécutable (déjà présente ⇒
-- rien). Aucune donnée n'est touchée.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def
    FROM pg_constraint WHERE conname = 'gestion_journal_entite_chk' AND conrelid = 'gestion_journal'::regclass;
  IF def IS NULL THEN
    RAISE EXCEPTION 'La contrainte gestion_journal_entite_chk est introuvable : le module gestion est-il installé ?';
  END IF;
  IF position('''annuaire_lot''' IN def) > 0 THEN RETURN; END IF;
  EXECUTE 'ALTER TABLE gestion_journal DROP CONSTRAINT gestion_journal_entite_chk';
  EXECUTE 'ALTER TABLE gestion_journal ADD CONSTRAINT gestion_journal_entite_chk '
          || replace(def, 'ARRAY[', 'ARRAY[''annuaire_lot''::text, ');
END $$;

COMMIT;
