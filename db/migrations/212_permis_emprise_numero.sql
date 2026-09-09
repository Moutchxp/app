-- 212 — NUMÉRO STABLE D'EMPRISE (nommage distinct « bâtiment en projet 1/2… »). Chaque emprise reçoit à la création un numéro PAR DOSSIER,
--   monotone, JAMAIS réattribué après une suppression : un numéro ne change jamais de titulaire (décision d'Arno — sinon toute note qu'il a
--   prise deviendrait fausse). Le nom AFFICHÉ reste DÉRIVÉ (repère du bâtiment rattaché → repli maison, + « (numéro) » si ce bâtiment porte
--   plusieurs emprises) ; SEUL le numéro est stocké.
--
-- Deux objets ADDITIFS et idempotents :
--   1. `permis_emprise_numero(dossier_id, dernier_numero)` : compteur PAR DOSSIER qui ne DÉCROÎT jamais (même si l'emprise du plus haut
--      numéro est supprimée) → garantit « jamais réattribué ». Bumpé atomiquement à chaque création (ON CONFLICT … +1). C'est pour cela qu'un
--      simple MAX(numero)+1 ne suffit PAS : supprimer la dernière emprise ferait redescendre le max et réutiliserait le numéro.
--   2. `permis_emprise_reconstruite.numero` : le numéro figé de l'emprise.
--
-- REPRISE des emprises DÉJÀ en base : chacune reçoit un numéro dans son ORDRE DE CRÉATION (id croissant) PAR dossier ; le compteur est amorcé
--   au maximum par dossier. Aucune donnée existante n'est modifiée hors ce remplissage du nouveau champ (aucun DROP, DELETE ni TRUNCATE).
--
-- RÉSILIENT : le code (listerEmprises, enregistrerEmprise) gère l'ABSENCE de la colonne/table (42703 / 42P01) sans casser — le nom retombe
--   alors sur un rang DÉRIVÉ (best-effort, par id) tant que cette migration n'est pas appliquée.
--
-- ⚠️ Ce fichier N'EST PAS lancé automatiquement — Arno l'applique :
--     psql "$DATABASE_URL" -f db/migrations/212_permis_emprise_numero.sql

CREATE TABLE IF NOT EXISTS permis_emprise_numero (
  dossier_id     bigint  PRIMARY KEY,
  dernier_numero integer NOT NULL DEFAULT 0
);
COMMENT ON TABLE permis_emprise_numero IS
  'Compteur PAR DOSSIER du numéro d''emprise : monotone, ne décroît jamais → un numéro n''est jamais réattribué. Bumpé (+1) à chaque création d''emprise (enregistrerEmprise).';

ALTER TABLE permis_emprise_reconstruite ADD COLUMN IF NOT EXISTS numero integer;
COMMENT ON COLUMN permis_emprise_reconstruite.numero IS
  'Numéro STABLE de l''emprise dans son dossier (ordre de création, jamais réattribué après suppression). Désambiguïse le nom affiché quand un bâtiment porte plusieurs emprises. Le nom lui-même reste DÉRIVÉ (repère du bâtiment + « (numéro) »), jamais stocké.';

-- REPRISE : numéro = rang par ordre de création (id) DANS le dossier, seulement là où il manque (ré-exécutable sans effet).
WITH rangs AS (
  SELECT id, row_number() OVER (PARTITION BY dossier_id ORDER BY id) AS rang
    FROM permis_emprise_reconstruite
)
UPDATE permis_emprise_reconstruite e
   SET numero = r.rang
  FROM rangs r
 WHERE e.id = r.id AND e.numero IS NULL;

-- AMORCE du compteur au maximum par dossier (idempotent : GREATEST → ne redescend jamais).
INSERT INTO permis_emprise_numero (dossier_id, dernier_numero)
  SELECT dossier_id, COALESCE(MAX(numero), 0) FROM permis_emprise_reconstruite GROUP BY dossier_id
ON CONFLICT (dossier_id) DO UPDATE SET dernier_numero = GREATEST(permis_emprise_numero.dernier_numero, EXCLUDED.dernier_numero);
