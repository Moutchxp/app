-- 088_tri_plus_anciens.sql — Module VEILLE PERMIS (chantier Q3) : AJOUTE une 3e valeur à l'ordre secondaire d'examen des
-- dossiers `config_veille.tri_candidats` = 'date_ancienne_puis_surface' (« plus anciens d'abord » : date d'autorisation
-- CROISSANTE, puis surface). Les DEUX valeurs existantes ('surface_puis_date', 'date_puis_surface') sont INCHANGÉES.
-- Invariant « pilotage sans code » : la liste fermée du CHECK est la seule source de vérité des valeurs admises. Requiert 081.
--
-- SÛR : remplace UNIQUEMENT la contrainte CHECK de `tri_candidats` (DROP IF EXISTS puis ADD). Aucun DROP de table/colonne,
-- aucun UPDATE (la valeur courante reste valide), aucun trigger. N'écrit JAMAIS demande.statut. GOLDEN-SAFE. Un seul
-- BEGIN/COMMIT. Idempotente (DROP IF EXISTS + ADD → même état à chaque exécution).
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/088_tri_plus_anciens.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer.
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

-- Remplace la liste fermée : 2 → 3 valeurs. La colonne, son défaut ('surface_puis_date') et son NOT NULL sont conservés ;
-- seule la contrainte CHECK change. La valeur en base ('surface_puis_date' ou 'date_puis_surface') reste donc valide.
ALTER TABLE config_veille DROP CONSTRAINT IF EXISTS config_veille_tri_candidats_check;
ALTER TABLE config_veille ADD CONSTRAINT config_veille_tri_candidats_check
  CHECK (tri_candidats IN ('surface_puis_date', 'date_puis_surface', 'date_ancienne_puis_surface'));

COMMENT ON COLUMN config_veille.tri_candidats IS 'Ordre secondaire de départage des dossiers (ex-const ORDRE_SECONDAIRE), liste fermée. surface_puis_date = historique (surface puis date) ; date_puis_surface = plus récents d''abord ; date_ancienne_puis_surface = plus anciens d''abord (date croissante, puis surface). Gouverne À LA FOIS la sélection des candidats aux demandes ET l''ordre de la liste des dossiers affichée (onglet « Dossiers ») — même requête.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conrelid = 'config_veille'::regclass AND conname = 'config_veille_tri_candidats_check';
--   -- attendu : CHECK (tri_candidats IN ('surface_puis_date','date_puis_surface','date_ancienne_puis_surface'))
--
--   SELECT tri_candidats FROM config_veille WHERE id = 1;  -- la valeur courante n'a PAS changé
--
--   -- Contrôles (en transaction annulée) :
--   -- BEGIN; UPDATE config_veille SET tri_candidats = 'date_ancienne_puis_surface' WHERE id = 1; ROLLBACK;  -- OK (3e valeur admise)
--   -- BEGIN; UPDATE config_veille SET tri_candidats = 'au_hasard'                  WHERE id = 1; ROLLBACK;  -- ÉCHOUE (hors liste)
