-- ══ 418 — LE JOURNAL ACCEPTE LES ENTITÉS « location_activite » ET « location_bail » (Arno, 24/10/2026) ═════════════════════════
--
-- « Dossier de location » (depuis Suivi du mois) et la réparation de la catégorie de prime journalisent chaque champ modifié d'une
-- ligne du suivi (`location_activite`, entite_id = gestion_location_activite.id) et des conditions d'entrée d'un bail
-- (`location_bail`, entite_id = gestion_bail.id). Le journal n'accepte qu'une liste fermée d'entités (`gestion_journal_entite_chk`).
--
-- 🔴 ON AJOUTE À LA LISTE EXISTANTE, ON NE LA RÉÉCRIT PAS (la règle des 260 et 331) : la contrainte en place est lue et la valeur y
-- est insérée — ordre d'application indifférent, geste réexécutable (déjà présente ⇒ rien). Aucune donnée n'est touchée.
-- Ajout seul, rejouable, sans BEGIN/COMMIT (le lanceur l'enveloppe).

DO $$
DECLARE def text; v text;
BEGIN
  FOREACH v IN ARRAY ARRAY['location_activite', 'location_bail'] LOOP
    SELECT pg_get_constraintdef(oid) INTO def
      FROM pg_constraint WHERE conname = 'gestion_journal_entite_chk' AND conrelid = 'gestion_journal'::regclass;
    IF def IS NULL THEN
      RAISE EXCEPTION 'La contrainte gestion_journal_entite_chk est introuvable : le module gestion est-il installé ?';
    END IF;
    IF position('''' || v || '''' IN def) > 0 THEN CONTINUE; END IF;
    EXECUTE 'ALTER TABLE gestion_journal DROP CONSTRAINT gestion_journal_entite_chk';
    EXECUTE 'ALTER TABLE gestion_journal ADD CONSTRAINT gestion_journal_entite_chk '
            || replace(def, 'ARRAY[', 'ARRAY[''' || v || '''::text, ');
  END LOOP;
END $$;
