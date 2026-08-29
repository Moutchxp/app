-- 167_permis_polygone_statut_mixte.sql — RATT-6 : troisième statut « mixte » (partiellement détruit), déduit de la géométrie.
--
-- POURQUOI : un bâtiment MORDU par l'emprise projetée sans être entièrement couvert n'est ni préservé ni détruit — une partie tombe,
-- une partie survit. RATT-6 ajoute le statut « mixte » (FAIT géométrique déduit du taux de recouvrement, NON modifiable à la main) et
-- l'origine « auto_mixte » (l'automatisme l'a posé d'office, comme 'auto_recouvrement' pour un détruit total). Les deux listes fermées
-- des CHECK (migrations 164 et 165) doivent l'accepter.
--
-- 🔴 APPEND-ONLY INTACT : on modifie des CONTRAINTES (DROP/ADD CONSTRAINT = DDL), jamais des lignes → le trigger append-only de la 164
-- (BEFORE UPDATE/DELETE/TRUNCATE) n'est PAS déclenché. Aucune ligne existante réécrite ; les valeurs déjà présentes restent valides
-- (les nouvelles listes sont des SUR-ENSEMBLES des anciennes). Ne touche NI le moteur de verdict SVAV, NI le golden.
--
-- ⚠️ RÉSILIENCE CÔTÉ CODE (si CETTE migration n'est pas encore appliquée) : `poserStatutPolygone` intercepte la violation de CHECK
-- (SQLSTATE 23514) et REPLIE proprement 'mixte'→'detruit' et 'auto_mixte'→'auto_recouvrement' (ancien comportement : détruit ENTIER),
-- sans crash. L'app tourne donc AVANT comme APRÈS ; appliquer la 167 « débloque » simplement le vrai statut mixte.
--
-- SÛR : DDL idempotente (DROP CONSTRAINT IF EXISTS puis ADD, mêmes noms). Requiert `permis_polygone_statut` (164) + colonne `origine`
-- (165, appliquée). Application MANUELLE (Arno), APRÈS la 166, arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/167_permis_polygone_statut_mixte.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS.

BEGIN;

-- statut : + 'mixte'
ALTER TABLE permis_polygone_statut DROP CONSTRAINT IF EXISTS permis_polygone_statut_statut_chk;
ALTER TABLE permis_polygone_statut
  ADD CONSTRAINT permis_polygone_statut_statut_chk CHECK (statut IN ('preserve','detruit','mixte','revoque'));

-- origine : + 'auto_mixte'
ALTER TABLE permis_polygone_statut DROP CONSTRAINT IF EXISTS permis_polygone_statut_origine_chk;
ALTER TABLE permis_polygone_statut
  ADD CONSTRAINT permis_polygone_statut_origine_chk CHECK (origine IN ('saisie','auto_recouvrement','auto_mixte','auto_revocation'));

COMMENT ON CONSTRAINT permis_polygone_statut_statut_chk ON permis_polygone_statut IS
  'RATT-6 — liste fermée du statut : preserve | detruit | mixte (partiellement détruit, fait géométrique NON modifiable) | revoque.';
COMMENT ON CONSTRAINT permis_polygone_statut_origine_chk ON permis_polygone_statut IS
  'RATT-6 — liste fermée de l''origine : saisie (Arno) | auto_recouvrement (détruit total d''office) | auto_mixte (mixte d''office) | auto_revocation (l''auto défait SA ligne quand le recouvrement disparaît).';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (S'EXÉCUTE quand tu lances le fichier — AFFICHE le résultat) :
\echo '>>> CHECK statut + origine (listes fermées, doivent inclure mixte / auto_mixte) :'
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid = 'permis_polygone_statut'::regclass AND contype = 'c' ORDER BY conname;
\echo '>>> répartition des statuts existants (aucun « mixte » attendu tant que l''auto n''a pas tourné après application) :'
SELECT statut, origine, count(*) FROM permis_polygone_statut GROUP BY statut, origine ORDER BY statut, origine;
