-- 117_corps_polygone_affectation.sql — Module VEILLE PERMIS (chantier FUS-3d) : AFFECTATION MANUELLE d'un polygone BD TOPO
-- (cleabs) au corps de bâtiment déclaré qui lui correspond.
--
-- POURQUOI CE MODÈLE (colonne, pas table de liaison) :
--  · le lien est 1:1 — chaque corps ↔ AU PLUS un polygone ; chaque polygone ↔ AU PLUS un corps DU MÊME PERMIS. C'est un
--    ATTRIBUT INTRINSÈQUE du corps (quel polygone BD TOPO ce bâtiment déclaré est devenu), pas une relation portant ses propres
--    attributs → une COLONNE sur permis_corps_batiment, pas une table de liaison (qui serait de la sur-ingénierie ici) ;
--  · le corps existe déjà ; l'affectation se fait AVANT l'injection d'altitude (FUS-3e). permis_polygone_altitude est clé par
--    cleabs mais ses lignes ne naissent qu'À L'INJECTION → le lien ne peut pas y vivre (les lignes peuvent ne pas exister encore).
--    Le corps, lui, existe toujours → le lien va sur le corps.
--
-- EXCLUSIVITÉ CÔTÉ BASE : un index UNIQUE PARTIEL (dossier_id, cleabs_affecte) WHERE cleabs_affecte IS NOT NULL garantit qu'un
-- cleabs est affecté à AU PLUS UN corps du même dossier — pas seulement à l'écran. NULL autorisé (plusieurs corps sans polygone :
-- cardinalités inégales, bâtiments accolés). RÉVERSIBILITÉ : simple UPDATE de la colonne, aucun verrouillage. Pas de FK vers
-- batiment (son cleabs n'est PAS unique — la PK est fid) : la validité du cleabs (présent dans l'empreinte) est vérifiée côté app.
--
-- SÛR : DDL strictement ADDITIVE (ADD COLUMN / CREATE INDEX … IF NOT EXISTS). Aucun DROP, aucun UPDATE, aucune colonne existante
-- touchée. Ne touche NI le moteur de verdict SVAV NI le golden. Idempotente. Un seul BEGIN/COMMIT. Requiert permis_corps_batiment.
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/117_corps_polygone_affectation.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS.

BEGIN;

ALTER TABLE permis_corps_batiment
  ADD COLUMN IF NOT EXISTS cleabs_affecte text;  -- cleabs du polygone BD TOPO affecté à ce corps ; NULL = pas encore affecté

-- Exclusivité PAR PERMIS : un cleabs → au plus un corps du même dossier. Partiel (les NULL cohabitent : plusieurs corps sans polygone).
CREATE UNIQUE INDEX IF NOT EXISTS permis_corps_cleabs_affecte_ux
  ON permis_corps_batiment (dossier_id, cleabs_affecte) WHERE cleabs_affecte IS NOT NULL;

COMMENT ON COLUMN permis_corps_batiment.cleabs_affecte IS
  'FUS-3d — cleabs du polygone BD TOPO affecté MANUELLEMENT à ce corps (repère A/B/C… à l''écran). NULL = non affecté (corps sans polygone, cardinalités inégales). Exclusivité par permis garantie par l''index partiel permis_corps_cleabs_affecte_ux (un cleabs → au plus un corps du dossier). Réversible (simple UPDATE). Ne porte PAS d''altitude (celle-ci vit dans permis_polygone_altitude, posée à l''injection FUS-3e).';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (S'EXÉCUTE quand tu lances le fichier — AFFICHE le résultat) :
\echo '>>> colonne cleabs_affecte :'
SELECT column_name, data_type, is_nullable FROM information_schema.columns
 WHERE table_name = 'permis_corps_batiment' AND column_name = 'cleabs_affecte';
\echo '>>> index d''exclusivité (partiel) :'
SELECT indexname, indexdef FROM pg_indexes WHERE indexname = 'permis_corps_cleabs_affecte_ux';
