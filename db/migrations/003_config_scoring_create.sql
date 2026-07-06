-- =====================================================================
-- 003 — CREATE TABLE config_scoring (rapatriement d'une table hors versioning)
--
-- CONTEXTE / DETTE : la table `config_scoring` (singleton id=1 lu au runtime
-- par app/lib/db/profilConfig.ts) PRÉEXISTE en base mais n'avait AUCUN
-- `CREATE TABLE` versionné — créée à la main, seul un ALTER l'avait complétée
-- (scripts/migration_config_scoring_orientation_annee_portee.sql, colonnes 16–46).
-- Cette migration rapatrie le schéma EXACT relevé en base, pour le rendre
-- reproductible depuis le dépôt.
--
-- IDEMPOTENTE & NON DESTRUCTIVE : `CREATE TABLE IF NOT EXISTS` + seed
-- `INSERT ... ON CONFLICT (id) DO NOTHING`. Aucun DROP / DELETE / TRUNCATE /
-- ALTER, aucune modification de l'existant. Sur la base actuelle (table +
-- ligne id=1 déjà présentes), cette migration est un NO-OP : ni la structure
-- ni la ligne existante ne sont touchées.
--
-- Colonnes de base (pos 2–15) : NOT NULL SANS DEFAULT, à l'identique de
-- l'existant (leur valeur vit dans le singleton, seedé plus bas).
-- Colonnes 16–46 : NOT NULL avec DEFAULT verbatim de la recon. PK(id) +
-- CHECK (id = 1). Le seed = PROFIL_DEGAGEMENT_DEFAUT (profilDegagement.ts).
--
-- Application : psql "$DATABASE_URL" -f db/migrations/003_config_scoring_create.sql
-- =====================================================================

CREATE TABLE IF NOT EXISTS config_scoring (
  id                          integer          NOT NULL DEFAULT 1,
  -- Colonnes de base (pos 2–15) : NOT NULL, AUCUN défaut (identique à l'existant).
  boost_f2                    double precision NOT NULL,
  boost_f4                    double precision NOT NULL,
  forfait_cone_central        double precision NOT NULL,
  forfait_extremites          double precision NOT NULL,
  cone_f3_demi_angle_deg      double precision NOT NULL,
  distance_max_m              double precision NOT NULL,
  plafond_couche1             double precision NOT NULL,
  plafond_degagement          double precision NOT NULL,
  mode_combinaison            text             NOT NULL,
  couloir_seuil_lateral_m     double precision NOT NULL,
  couloir_fenetre_condition_n integer          NOT NULL,
  couloir_tolerance_bord_n    integer          NOT NULL,
  couloir_malus_pct           double precision NOT NULL,
  natures_remarquables        text[]           NOT NULL,
  -- Colonnes ajoutées par l'ALTER (pos 16–46) : NOT NULL AVEC défaut (verbatim recon).
  cone_famille_demi_angle_deg double precision NOT NULL DEFAULT 60,
  mondial_faisceau_m          double precision NOT NULL DEFAULT 800,
  mh_cone                     double precision NOT NULL DEFAULT 2.0,
  mh_flanc                    double precision NOT NULL DEFAULT 1.5,
  mh_distmax_m                double precision NOT NULL DEFAULT 400,
  inv_cone                    double precision NOT NULL DEFAULT 2.0,
  inv_flanc                   double precision NOT NULL DEFAULT 1.5,
  inv_distmax_m               double precision NOT NULL DEFAULT 400,
  a1900_cone                  double precision NOT NULL DEFAULT 1.5,
  a1900_flanc                 double precision NOT NULL DEFAULT 1.2,
  a1900_distmax_m             double precision NOT NULL DEFAULT 300,
  a1935_cone                  double precision NOT NULL DEFAULT 1.2,
  a1935_flanc                 double precision NOT NULL DEFAULT 1.1,
  a1935_distmax_m             double precision NOT NULL DEFAULT 200,
  cumul_seuil_min_m           double precision NOT NULL DEFAULT 30,
  cumul_base_m                double precision NOT NULL DEFAULT 25,
  cumul_pas_m                 double precision NOT NULL DEFAULT 5,
  cumul_increment             double precision NOT NULL DEFAULT 0.1,
  cumul_plafond               double precision NOT NULL DEFAULT 2.0,
  cumul_cap_p1_m              double precision NOT NULL DEFAULT 200,
  orientation_n               double precision NOT NULL DEFAULT 0,
  orientation_ne              double precision NOT NULL DEFAULT 1,
  orientation_e               double precision NOT NULL DEFAULT 5,
  orientation_se              double precision NOT NULL DEFAULT 8,
  orientation_s               double precision NOT NULL DEFAULT 10,
  orientation_so              double precision NOT NULL DEFAULT 9,
  orientation_o               double precision NOT NULL DEFAULT 7,
  orientation_no              double precision NOT NULL DEFAULT 3,
  borne_annee_1900            integer          NOT NULL DEFAULT 1900,
  borne_annee_1935            integer          NOT NULL DEFAULT 1935,
  analysis_range_m            integer          NOT NULL DEFAULT 200,
  CONSTRAINT config_scoring_pkey PRIMARY KEY (id),
  CONSTRAINT config_scoring_id_check CHECK (id = 1)
);

-- Seed idempotent du singleton id=1 (= PROFIL_DEGAGEMENT_DEFAUT).
-- Sur une base où la ligne existe déjà, ON CONFLICT (id) DO NOTHING => NO-OP.
INSERT INTO config_scoring (
  id,
  boost_f2, boost_f4, forfait_cone_central, forfait_extremites, cone_f3_demi_angle_deg,
  distance_max_m, plafond_couche1, plafond_degagement, mode_combinaison,
  couloir_seuil_lateral_m, couloir_fenetre_condition_n, couloir_tolerance_bord_n, couloir_malus_pct,
  natures_remarquables,
  cone_famille_demi_angle_deg, mondial_faisceau_m,
  mh_cone, mh_flanc, mh_distmax_m,
  inv_cone, inv_flanc, inv_distmax_m,
  a1900_cone, a1900_flanc, a1900_distmax_m,
  a1935_cone, a1935_flanc, a1935_distmax_m,
  cumul_seuil_min_m, cumul_base_m, cumul_pas_m, cumul_increment, cumul_plafond, cumul_cap_p1_m,
  orientation_n, orientation_ne, orientation_e, orientation_se,
  orientation_s, orientation_so, orientation_o, orientation_no,
  borne_annee_1900, borne_annee_1935, analysis_range_m
) VALUES (
  1,
  0.3, 2.5, 300, 200, 60,
  200, 90, 80, 'max',
  3, 16, 2, 0.01,
  ARRAY['Eglise','Monument','Chapelle','Château','Tour, donjon','Arc de triomphe'],
  60, 800,
  2.0, 1.5, 400,
  2.0, 1.5, 400,
  1.5, 1.2, 300,
  1.2, 1.1, 200,
  30, 25, 5, 0.1, 2.0, 200,
  0, 1, 5, 8,
  10, 9, 7, 3,
  1900, 1935, 200
)
ON CONFLICT (id) DO NOTHING;
