-- 213 — VALIDATION PAR EMPRISE (et non plus par bâtiment). Chaque emprise porte désormais son PROPRE état de validation → deux emprises
--   d'un même bâtiment se valident indépendamment, et créer / effacer / modifier une emprise n'affecte PLUS la validation des autres.
--   Corrige aussi la perte de validation via « Modifier l'emprise » (dévalidation eager d'un pointeur unique par corps — bouton retiré côté UI).
--
-- ADDITIF, idempotent : deux colonnes sur l'emprise. « Validée » ⟺ validee_le IS NOT NULL.
--   REPRISE : toute emprise aujourd'hui POINTÉE par `emprise_validee_id` de son corps (migration 206 — un seul pointeur par bâtiment)
--   devient validée, AVEC la date et l'auteur de cette validation. L'ancien pointeur `permis_corps_batiment.emprise_validee_id` est
--   CONSERVÉ (JAMAIS supprimé dans ce lot) mais n'est PLUS LU pour la validation : la vérité passe sur l'emprise. Aucune donnée perdue.
--   Conséquence attendue : un bâtiment qui avait PLUSIEURS emprises mais un seul pointeur voit ses emprises NON pointées repasser
--   « à valider » (elles n'avaient jamais été validées individuellement — l'ancien modèle ne le permettait pas).
--
-- RÉSILIENT : le code (listerEmprises, validerEmprise/devaliderEmprise, rollup liste + dépliant) gère l'ABSENCE des colonnes (42703) sans casser.
--
-- ⚠️ Ce fichier N'EST PAS lancé automatiquement — Arno l'applique :
--     psql "$DATABASE_URL" -f db/migrations/213_permis_emprise_validee.sql

ALTER TABLE permis_emprise_reconstruite
  ADD COLUMN IF NOT EXISTS validee_le  timestamptz,
  ADD COLUMN IF NOT EXISTS validee_par text;
COMMENT ON COLUMN permis_emprise_reconstruite.validee_le IS
  'Validation PAR EMPRISE (décision humaine, réversible) : horodatage. NULL = non validée. Remplace le pointeur unique permis_corps_batiment.emprise_validee_id (conservé mais non lu). Retombe à NULL dès que la géométrie AFFICHÉE change (retouche validée, ajustement enregistré, retour au tracé d''origine).';
COMMENT ON COLUMN permis_emprise_reconstruite.validee_par IS
  'Auteur de la validation de cette emprise (e-mail / id admin), même sémantique que permis_corps_batiment.emprise_validee_par.';

-- REPRISE : l'emprise pointée par emprise_validee_id de son corps devient validée, avec la date/auteur de ce corps (uniquement là où c'est vide → ré-exécutable).
UPDATE permis_emprise_reconstruite e
   SET validee_le = cb.emprise_validee_le,
       validee_par = cb.emprise_validee_par
  FROM permis_corps_batiment cb
 WHERE cb.emprise_validee_id = e.id
   AND cb.emprise_validee_le IS NOT NULL
   AND e.validee_le IS NULL;
