-- 168_permis_corps_batiment_nom_repli.sql — NOM-1 : nom de REPLI MAISON d'un corps de bâtiment, DISTINCT de `repere`.
--
-- POURQUOI : « bâtiment 3 » n'est pas un nom — c'est l'identifiant interne du corps (permis_corps_batiment.id), affiché faute de mieux
-- quand `repere` est NULL. Arno veut un vrai nom : le `repere` LU dans les documents prime toujours ; à défaut, un repli « bâtiment en
-- projet {rang} » (code court 'BP{rang}', ou 'BP' pour un permis à un seul corps). Ce repli doit vivre dans SA PROPRE colonne :
-- 🔴 `repere` est la CLÉ DE RÉCONCILIATION de l'extraction (ecritureLots apparie les lots aux corps par repère) — on n'y écrit JAMAIS un
-- nom inventé par nous. D'où une colonne distincte `nom_repli`.
--
-- FORME (sobre) : UNE colonne texte `nom_repli` = code court stable ('BP' | 'BP{n}'). Le libellé long (« bâtiment en projet {n} ») est
-- DÉRIVÉ à l'affichage (fonction pure libelleNomRepli) — pas stocké (aucune redondance à maintenir). Attribué UNE fois (stabilité : un
-- bâtiment ne change pas de nom), jamais dans `repere`.
--
-- SÛR : DDL strictement ADDITIVE (ADD COLUMN IF NOT EXISTS, CHECK inline idempotent). Ne touche NI `repere`, NI l'appariement, NI le
-- moteur de verdict / le golden. Résilience CÔTÉ CODE si non appliquée : lectures repliées (nom_repli = NULL) et attribution best-effort
-- avalent l'absence de colonne (42703) → l'affichage retombe sur l'ancien « bâtiment {id} », sans crash. Requiert `permis_corps_batiment`.
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/168_permis_corps_batiment_nom_repli.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS.

BEGIN;

ALTER TABLE permis_corps_batiment
  ADD COLUMN IF NOT EXISTS nom_repli text
    CHECK (nom_repli IS NULL OR nom_repli ~ '^BP[0-9]*$');

COMMENT ON COLUMN permis_corps_batiment.nom_repli IS
  'NOM-1 — nom de REPLI MAISON d''un corps SANS `repere` (aucun nom lu dans les documents) : code court stable « BP » (permis à un seul corps → « bâtiment en projet », sans numéro) ou « BP{rang} » (« bâtiment en projet {rang} », rang = position du corps dans le permis). Attribué UNE fois (attribuerNomsRepli), jamais recalculé, jamais écrit dans `repere` (qui reste réservé au nom LU dans les documents et sert de clé de réconciliation à l''extraction). Le libellé long est dérivé à l''affichage (libelleNomRepli). N''alimente NI verdict NI altitude.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (S'EXÉCUTE quand tu lances le fichier — AFFICHE le résultat) :
\echo '>>> colonne nom_repli + CHECK de format :'
SELECT column_name, data_type, is_nullable FROM information_schema.columns
 WHERE table_name = 'permis_corps_batiment' AND column_name = 'nom_repli';
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid = 'permis_corps_batiment'::regclass AND conname LIKE '%nom_repli%';
\echo '>>> corps sans repere ET sans nom_repli (candidats à l''attribution au prochain évènement corps/adoption) :'
SELECT dossier_id, count(*) AS corps_anonymes FROM permis_corps_batiment
 WHERE repere IS NULL AND nom_repli IS NULL GROUP BY dossier_id ORDER BY dossier_id LIMIT 20;
