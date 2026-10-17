-- 368_gestion_tache_sans_bien.sql — LOT GESTION-TACHES-SANS-BIEN (17/10/2026) : UNE TÂCHE PEUT EXISTER SANS BIEN.
--
-- DÉCISION D'ARNO (17/10/2026) : « je lève la règle “une tâche = un bien” (décision du 13/10) : une tâche peut désormais
-- exister SANS bien. Migration 368 enveloppée : lot_id devient facultatif, aucune tâche existante modifiée. »
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE : la colonne `gestion_tache.lot_id` accepte NULL. La clé étrangère vers
-- `gestion_annuaire_lot` reste (une tâche AVEC bien désigne toujours un bien qui existe). Aucune ligne n'est lue ni
-- modifiée ; aucun index, aucune autre table, aucune autre colonne touchés.
--
-- ⚠️ CODE D'AVANT CE LOT : il lisait les tâches par une jointure obligatoire sur le bien ; une tâche sans bien y est
-- simplement absente (aucune erreur). Les tâches existantes ont toutes un bien : rien ne change pour elles.
--
-- IDEMPOTENTE (DROP NOT NULL sur une colonne déjà facultative ne fait rien). Pas de BEGIN/COMMIT : la mise à jour de la
-- prod l'enveloppe dans UNE transaction avec son inscription.

ALTER TABLE gestion_tache ALTER COLUMN lot_id DROP NOT NULL;

COMMENT ON COLUMN gestion_tache.lot_id IS 'Le bien de la tâche ; NULL = tâche sans bien (décision d''Arno du 17/10/2026, migration 368).';
