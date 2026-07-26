-- 048_config_veille.sql — Module VEILLE PERMIS (chantier S3) : configuration de la tuile « Permis de construire ».
--
-- MOTIF : la tuile d'administration classe et affiche les dossiers Sitadel. TOUTES ses variables (seuils de
-- catégorisation, rangs d'affichage, profondeur par défaut) sont PILOTABLES SANS CODE — table de config lue au runtime,
-- jamais de valeur en dur (exigence pilotage-sans-code). Singleton (une seule ligne id=1). Lecture avec REPLI SÛR sur les
-- valeurs par défaut si la ligne manque (cf. `chargerConfigVeille`).
--
-- POURQUOI DEUX SEUILS EN « OU » (logements OU surface) pour « immeuble » : mesuré sur les données réelles, des PC SANS
-- AUCUN LOGEMENT déclaré (nb_lgt = 0) atteignent 47 153 m² à Paris et 127 078 m² en Seine-Saint-Denis — ce sont des
-- IMMEUBLES NON RÉSIDENTIELS (bureaux, équipements). Le nombre de logements ne peut donc PAS être une condition d'entrée :
-- un immeuble se qualifie par le nombre de logements OU par la surface créée, jamais par les deux exigés ensemble.
--
-- SÛR : DDL + une ligne de configuration (id=1). Aucun DROP, aucune écriture ailleurs. Idempotent (IF NOT EXISTS +
-- ON CONFLICT DO NOTHING). GOLDEN-SAFE : aucun contact moteur/config_scoring/batiment → golden 29.107259068449615 intact.
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/048_config_veille.sql
-- Vérification : \d config_veille · SELECT * FROM config_veille;

BEGIN;

CREATE TABLE IF NOT EXISTS config_veille (
  id                        integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),           -- singleton verrouillé
  -- Seuils de la catégorie « immeuble » (condition en OU — cf. en-tête).
  seuil_logements_immeuble  integer NOT NULL DEFAULT 10   CHECK (seuil_logements_immeuble  BETWEEN 1   AND 500),
  seuil_surface_immeuble_m2 integer NOT NULL DEFAULT 1500 CHECK (seuil_surface_immeuble_m2 BETWEEN 100 AND 100000),
  -- Profondeur d'affichage par défaut (nombre d'années récentes montrées avant élargissement).
  annees_par_defaut         integer NOT NULL DEFAULT 3    CHECK (annees_par_defaut        BETWEEN 1   AND 20),
  -- Rangs d'affichage des catégories (le plus petit rang s'affiche en premier). Réordonnables sans code.
  rang_immeuble_neuf        integer NOT NULL DEFAULT 1    CHECK (rang_immeuble_neuf        BETWEEN 1 AND 99),
  rang_surelevation         integer NOT NULL DEFAULT 2    CHECK (rang_surelevation         BETWEEN 1 AND 99),
  rang_construction_neuve   integer NOT NULL DEFAULT 3    CHECK (rang_construction_neuve   BETWEEN 1 AND 99),
  rang_extension            integer NOT NULL DEFAULT 4    CHECK (rang_extension            BETWEEN 1 AND 99),
  rang_demolition           integer NOT NULL DEFAULT 5    CHECK (rang_demolition           BETWEEN 1 AND 99)
);

COMMENT ON TABLE config_veille IS 'Configuration (singleton id=1) de la tuile admin « Permis de construire » : seuils de catégorisation (immeuble = logements OU surface), rangs d''affichage réordonnables, profondeur par défaut. Lue au runtime, repli sûr si absente.';
COMMENT ON COLUMN config_veille.seuil_surface_immeuble_m2 IS 'Seuil de surface (m²) qualifiant un immeuble EN PLUS du seuil logements (OU) : des PC à 0 logement atteignent >100 000 m² (immeubles non résidentiels).';

-- Ligne singleton (valeurs par défaut ci-dessus). ON CONFLICT DO NOTHING : rejouer la migration ne réécrit pas une
-- configuration déjà ajustée par Arno.
INSERT INTO config_veille (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

COMMIT;
