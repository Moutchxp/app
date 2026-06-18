-- =====================================================================
-- Bloc B (suite) — bdtopo_batiment devient une VUE sur batiment.
-- Décision : on RÉUTILISE la BD TOPO déjà chargée (table batiment), sans
-- dupliquer les données. La vue donne un nom stable côté code et expose
-- les colonnes utiles à la cascade hauteur (SPEC_module_hauteurs_v3.md).
-- Idempotent : DROP TABLE IF EXISTS + CREATE OR REPLACE VIEW.
-- geom est exposée telle quelle (aucune fonction enveloppante) pour que
-- l'index GIST de batiment reste utilisable à travers la vue.
-- =====================================================================

-- La table bdtopo_batiment (créée vide en 001) est remplacée par une vue.
DROP TABLE IF EXISTS bdtopo_batiment;

CREATE OR REPLACE VIEW bdtopo_batiment AS
  SELECT
    fid                     AS id,
    cleabs,
    geom,                                 -- MultiPolygonZ / 2154 (index GIST de batiment)
    hauteur,                              -- cascade priorité 2 (+ sol)
    altitude_minimale_sol,                -- z_min_sol
    altitude_maximale_toit,               -- cascade priorité 1 (z_max_toit)
    altitude_minimale_toit,               -- détection plat/pente
    nombre_d_etages,                      -- cascade priorité 3 (×2.90)
    nature,
    usage_1,
    usage_2
  FROM batiment;

COMMENT ON VIEW bdtopo_batiment IS
  'Vue sur la table batiment (BD TOPO® complète, L93/2154). Nom stable côté code : validation du point d''origine, fallback hauteur Mode B et masquage végétation. Aucune duplication de données.';
