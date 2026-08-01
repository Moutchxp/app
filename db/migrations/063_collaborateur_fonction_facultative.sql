-- 063_collaborateur_fonction_facultative.sql — Module VEILLE PERMIS (correctif S8a) : fonction facultative.
--
-- MOTIF : la fonction d'un collaborateur est INFORMATIVE, pas obligatoire. Un collaborateur sans fonction reste
-- éligible au tourniquet ; le courrier omet proprement la mention (pas de virgule orpheline). On rend donc la colonne
-- NULLABLE (`fonction` valait NOT NULL depuis la migration 062) — NULL = fonction non renseignée.
--
-- SÛR : ALTER COLUMN DROP NOT NULL seulement. Aucune donnée modifiée, aucun DROP. GOLDEN-SAFE.
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/063_collaborateur_fonction_facultative.sql
-- Vérification : \d collaborateur  (la colonne fonction ne doit plus être « not null »)

BEGIN;

ALTER TABLE collaborateur ALTER COLUMN fonction DROP NOT NULL;
COMMENT ON COLUMN collaborateur.fonction IS 'Fonction du signataire (FACULTATIVE) : établit la qualité pour agir au nom de la société et renforce la demande en cas de silence de l''administration. NULL = non renseignée.';

COMMIT;
