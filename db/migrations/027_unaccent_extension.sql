-- 027_unaccent_extension.sql — Extension PostgreSQL `unaccent` (recherche insensible aux accents).
--
-- MOTIF : le futur moteur de recherche de contacts (module INTERNAUTE, LOT A) doit matcher « Thévenin » quand on
--   tape « thevenin », et inversement « Léa » ↔ « lea ». `ILIKE` gère la CASSE mais PAS les diacritiques ; la
--   fonction `unaccent()` (extension `contrib` standard) normalise les accents à la recherche. Activer l'extension
--   ici la rend REPRODUCTIBLE depuis les migrations (une base neuve l'obtient), au lieu d'un état hors-piste.
--
-- PORTÉE : ACTIVATION d'extension UNIQUEMENT. Aucune table touchée, aucune donnée modifiée, AUCUN index (perf à
--   éventuellement traiter plus tard). Fonction PURE en lecture ; le moteur n'est ni rappelé ni modifié
--   (golden hors sujet) ; zéro pont M2. Idempotente (`IF NOT EXISTS`). À appliquer à la main après validation du diff.

BEGIN;

CREATE EXTENSION IF NOT EXISTS unaccent;

COMMIT;
