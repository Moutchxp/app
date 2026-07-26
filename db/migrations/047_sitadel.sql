-- 047_sitadel.sql — Module VEILLE PERMIS (chantier S2) : INGESTION Sitadel (autorisations d'urbanisme).
--
-- MOTIF : socle du moteur de veille « permis de construire ». On INGÈRE la base ouverte Sitadel (SDES) pour disposer,
-- en local, des dossiers PC (permis de construire) et PD (permis de démolir) du périmètre, dédoublonnés et traçables par
-- millésime. Ce chantier N'INGÈRE QUE : aucune géolocalisation (appariement adresse/cadastre = chantier S3), aucun contact
-- avec le moteur de verdict, le score, le certificat, ni avec `batiment`/`mns_*`/`mnt_*`.
--
-- TROIS TABLES :
--   1) sitadel_millesime   — traçabilité de chaque collecte (code, rids DiDo téléchargés, volumes).
--   2) commune_perimetre   — CONTRÔLE SANS CODE de ce qui est ingéré (voir plus bas : filtre au DÉPARTEMENT).
--   3) sitadel_dossier     — un dossier PC ou PD, champs BRUTS (l'adresse tronquée à 26 c et le numéro à suffixe sont
--                            conservés tels que Sitadel les livre — la normalisation est réversible et appartient à S3).
--
-- SÛR : DDL uniquement + une AMORCE de `commune_perimetre` (4 lignes de configuration, aucune donnée métier). Aucun DROP,
-- aucune écriture ailleurs. Idempotent (IF NOT EXISTS + ON CONFLICT DO NOTHING).
-- GOLDEN-SAFE : aucun contact moteur / config_scoring / batiment → golden 29.107259068449615 inchangé.
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/047_sitadel.sql
-- Vérification : \d sitadel_millesime · \d commune_perimetre · \d sitadel_dossier
--                SELECT DISTINCT departement FROM commune_perimetre WHERE actif;   -- attendu : 75, 92

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. MILLÉSIMES — traçabilité de la collecte (un millésime mensuel SDES = une ligne).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sitadel_millesime (
  id              serial PRIMARY KEY,
  code            text UNIQUE NOT NULL,                 -- ex. '2026-06' (millésime mensuel de la base ouverte)
  rid_logements   text,                                 -- identifiant DiDo du datafile « autorisations créant des logements »
  rid_locaux      text,                                 -- identifiant DiDo du datafile « autorisations créant des locaux »
  rid_pd          text,                                 -- identifiant DiDo du datafile « permis de démolir »
  telecharge_a    timestamptz NOT NULL DEFAULT now(),
  lignes_lues     bigint,                               -- total lignes CSV parcourues (3 fichiers)
  lignes_retenues bigint                                -- total dossiers retenus après filtre
);

COMMENT ON TABLE sitadel_millesime IS 'Journal des ingestions Sitadel (un millésime SDES = une ligne, avec les rids DiDo téléchargés et les volumes).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. PÉRIMÈTRE — quels territoires on ingère. CONTRÔLE SANS CODE, éditable au runtime.
--
--    FILTRE AU DÉPARTEMENT (et non à la commune) : un département est « actif » dès qu'il possède AU MOINS UNE ligne
--    `actif = true`. Raison : on ne peut pas pré-lister les ~259 communes du 78 ni les ~40 du 93 ; un ancrage au
--    département rend l'ouverture de 93/78 possible d'un SEUL UPDATE, sans code, sans énumération. (L'ingestion ≠ la
--    géolocalisation : en S2 on ingère TOUT le département actif ; le tri par couverture cadastre/adresse est en S3.)
--
--    AMORCE : 75 et 92 ACTIFS — les deux seuls départements géolocalisables aujourd'hui (`parcelle` couvre le 92 ;
--    `adresse_ban` couvre Paris à 100 %, mais seulement 8 communes du 93 et 26 du 78). 93 et 78 pré-amorcés INACTIFS.
--    OUVRIR le 93 (ou le 78) plus tard, sans code :  UPDATE commune_perimetre SET actif = true WHERE code_insee = '93000';
--
--    PARIS — divergence de référentiel assumée : Sitadel livre Paris sous le CODE COMMUNE UNIQUE 75056 ; `adresse_ban`
--    l'indexe par ARRONDISSEMENT (75101..75120). On stocke ici le CODE SITADEL 75056 (c'est lui que porte le dossier
--    ingéré, donc le seul qui permette au filtre de matcher), JAMAIS les 751xx. Le pont 75056 → 751xx est une affaire de
--    géolocalisation (S3), pas d'ingestion.
--
--    ANCRES DE DÉPARTEMENT : pour 92/93/78 (multi-communes) on pose une ligne sentinelle `<dep>000` — aucune commune
--    réelle n'a ce code (les INSEE communaux commencent à xxx001) : elle ne sert qu'à porter l'état actif/inactif du
--    département. Paris étant une commune Sitadel unique, on utilise directement son code réel 75056.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS commune_perimetre (
  code_insee  char(5)  PRIMARY KEY,                     -- code Sitadel (COMM) ; pour 92/93/78 : ancre `<dep>000`
  departement char(2)  NOT NULL,                        -- clé du filtre d'ingestion
  nom         text,
  actif       boolean  NOT NULL DEFAULT false
);

COMMENT ON TABLE commune_perimetre IS 'Périmètre d''ingestion Sitadel. Le filtre est au DÉPARTEMENT (actif dès une ligne actif=true). 75/92 amorcés actifs ; 93/78 ouvrables par UPDATE. Paris = code Sitadel 75056 (jamais les arrondissements 751xx : pont = S3).';
COMMENT ON COLUMN commune_perimetre.code_insee IS 'Code Sitadel (COMM). Ancre de département `<dep>000` pour 92/93/78 (aucune commune réelle en xxx000). Paris = 75056.';

INSERT INTO commune_perimetre (code_insee, departement, nom, actif) VALUES
  ('75056', '75', 'Paris (code Sitadel unique ; adresse_ban indexe par arrondissement 751xx — pont = S3)', true),
  ('92000', '92', 'Hauts-de-Seine — ancre de département', true),
  ('93000', '93', 'Seine-Saint-Denis — ancre de département (INACTIF : ouvrir par UPDATE actif=true)', false),
  ('78000', '78', 'Yvelines — ancre de département (INACTIF : ouvrir par UPDATE actif=true)', false)
ON CONFLICT (code_insee) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. DOSSIERS — un PC ou un PD. Champs BRUTS (adresse tronquée 26 c, numéro à suffixe : conservés INTACTS).
--    Un même permis mixte (logements + locaux) n'a QU'UNE ligne ici : dédoublonnage par NUM_DAU à l'ingestion.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sitadel_dossier (
  id                        bigserial PRIMARY KEY,
  type                      text     NOT NULL CHECK (type IN ('PC','PD')),   -- PC = permis de construire, PD = permis de démolir
  num_dau                   text     NOT NULL,                               -- NUM_DAU (PC) ou NUM_PD (PD), tel que livré
  code_insee                char(5)  NOT NULL,                               -- COMM Sitadel (brut ; Paris = 75056)
  departement               char(2)  NOT NULL,
  etat                      text,                                            -- ETAT_DAU / ETAT_PD (='2' = autorisé, à l'ingestion)
  date_reelle_autorisation  date,                                            -- DATE_REELLE_AUTORISATION
  nature_projet_completee   text,                                            -- NATURE_PROJET_COMPLETEE (PC ; NULL pour PD)
  i_extension               boolean,                                         -- I_EXTENSION (PC)
  i_surelevation            boolean,                                         -- I_SURELEVATION (PC)
  nb_lgt_tot_crees          integer,                                         -- NB_LGT_TOT_CREES (fichier logements uniquement)
  surf_creee                numeric,                                         -- SURF_HAB_CREEE + SURF_LOC_CREEE (calculé à l'ingestion)
  adr_num_ter               text,                                            -- ADR_*_TER : BRUTS (numéro à suffixe conservé)
  adr_libvoie_ter           text,                                            --   libellé de voie BRUT (tronqué à 26 c chez Sitadel — NON reconstitué)
  adr_lieudit_ter           text,
  adr_localite_ter          text,
  adr_codpost_ter           text,
  sec_cadastre1             text,
  num_cadastre1             text,
  sec_cadastre2             text,
  num_cadastre2             text,
  sec_cadastre3             text,
  num_cadastre3             text,
  superficie_terrain        integer,                                         -- SUPERFICIE_TERRAIN
  denom_dem                 text,                                            -- pétitionnaire (surtout exploité côté PD)
  siren_dem                 text,
  siret_dem                 text,
  millesime_id              integer REFERENCES sitadel_millesime(id),        -- millésime ayant POSÉ la charge utile de la ligne
  vu_le_premier_millesime   text     NOT NULL,                               -- code du 1er millésime où le dossier est apparu
  vu_le_dernier_millesime   text     NOT NULL,                               -- code du dernier millésime où il a été (re)vu — SEUL champ qui avance au réimport
  UNIQUE (type, num_dau)
);

COMMENT ON TABLE sitadel_dossier IS 'Dossiers Sitadel PC/PD ingérés (champs BRUTS). Unicité (type, num_dau) ; un dossier n''est jamais supprimé, seul vu_le_dernier_millesime avance au réimport. Normalisation adresse/cadastre = S3.';
COMMENT ON COLUMN sitadel_dossier.adr_libvoie_ter IS 'Libellé de voie BRUT, tronqué à 26 caractères par Sitadel. JAMAIS reconstitué à l''ingestion (normalisation réversible = S3).';

-- Index de service (S3 = géolocalisation ; ici on prépare seulement les accès de jointure).
CREATE INDEX IF NOT EXISTS sitadel_dossier_code_insee_idx        ON sitadel_dossier (code_insee);
CREATE INDEX IF NOT EXISTS sitadel_dossier_date_autorisation_idx ON sitadel_dossier (date_reelle_autorisation);
CREATE INDEX IF NOT EXISTS sitadel_dossier_cadastre_idx          ON sitadel_dossier (code_insee, sec_cadastre1, num_cadastre1);
CREATE INDEX IF NOT EXISTS sitadel_dossier_voie_idx              ON sitadel_dossier (code_insee, adr_libvoie_ter);

COMMIT;
