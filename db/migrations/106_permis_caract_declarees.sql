-- 106_permis_caract_declarees.sql — Module VEILLE PERMIS (chantier N7-C) : COLONNES D'ACCUEIL des caractéristiques DÉCLARÉES,
-- rendues atteignables par N7-B (lecture des champs AcroForm des Cerfa). Ce fichier PRÉPARE l'accueil ; il n'écrit AUCUNE donnée
-- et AUCUN mapping n'est fait ici (le code de mapping viendra dans un chantier séparé).
--
-- ORIGINE — ALIGNÉE SUR 103 : chaque valeur déclarée porte sa colonne `_origine` avec le MÊME CHECK que 103, soit
-- IN ('saisie','extraite') — DEUX valeurs. NULL = non renseigné ; 'saisie' = à la main ; 'extraite' = automatique. ⚠️ On NE
-- rajoute PAS une 3e valeur ('auto') ici : deux jeux de colonnes de la MÊME table avec des CHECK différents serait un piège
-- (une valeur valide pour les unes, refusée pour les autres). Si une 3e origine devient nécessaire un jour, on migrera 103 ET
-- 106 ENSEMBLE, dans une migration dédiée qui le dit explicitement. L'invariant « l'automatique n'écrase pas une saisie » reste
-- porté par le DÉPÔT (code), pas par le schéma.
--
-- SÛR : DDL strictement ADDITIVE (ADD COLUMN IF NOT EXISTS). Aucun DROP, aucun UPDATE, aucun backfill, aucune contrainte
-- resserrée, aucune colonne existante touchée (parking reste tel que 103 l'a créé), NI les CHECK de 103, NI le journal
-- d'extraction (104/105). Ne touche pas le moteur de score (golden intact). Idempotente. Un seul BEGIN/COMMIT. Requiert 103
-- (les 2 tables) et 105 (chaîne de migrations permis). PARCELLES volontairement ABSENTES (table dédiée permis_parcelle,
-- rôle origine/finale — autre chantier). Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/106_permis_caract_declarees.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer. TU NE L'APPLIQUES PAS.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- (1) permis_caracteristique — ce qui vaut pour le PERMIS ENTIER, tel que déclaré.
--   Chaque variable naît avec son TYPE ET sa PLAGE (bornes de sûreté), + son _origine (2 valeurs, comme 103).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE permis_caracteristique
  ADD COLUMN IF NOT EXISTS nature_projet                 text    CONSTRAINT permis_caract_nature_chk             CHECK (nature_projet IN ('habitation','bureaux','commerce','mixte','equipement','autre')),
  ADD COLUMN IF NOT EXISTS nature_projet_origine         text    CONSTRAINT permis_caract_nature_origine_chk     CHECK (nature_projet_origine IN ('saisie','extraite')),

  ADD COLUMN IF NOT EXISTS surface_plancher_m2           numeric CONSTRAINT permis_caract_surface_chk            CHECK (surface_plancher_m2 >= 0),
  ADD COLUMN IF NOT EXISTS surface_plancher_m2_origine   text    CONSTRAINT permis_caract_surface_origine_chk    CHECK (surface_plancher_m2_origine IN ('saisie','extraite')),

  ADD COLUMN IF NOT EXISTS nb_logements                  integer CONSTRAINT permis_caract_nblog_chk              CHECK (nb_logements >= 0),
  ADD COLUMN IF NOT EXISTS nb_logements_origine          text    CONSTRAINT permis_caract_nblog_origine_chk      CHECK (nb_logements_origine IN ('saisie','extraite')),

  ADD COLUMN IF NOT EXISTS nb_places_stationnement       integer CONSTRAINT permis_caract_nbstat_chk             CHECK (nb_places_stationnement >= 0),
  ADD COLUMN IF NOT EXISTS nb_places_stationnement_origine text  CONSTRAINT permis_caract_nbstat_origine_chk     CHECK (nb_places_stationnement_origine IN ('saisie','extraite')),

  ADD COLUMN IF NOT EXISTS adresse_terrain               text,
  ADD COLUMN IF NOT EXISTS adresse_terrain_origine       text    CONSTRAINT permis_caract_adr_terrain_origine_chk CHECK (adresse_terrain_origine IN ('saisie','extraite'));

COMMENT ON COLUMN permis_caracteristique.nature_projet IS
  'N7-C — nature DÉCLARÉE du projet, liste FERMÉE : habitation | bureaux | commerce | mixte | equipement | autre. NULL = non déterminé. Portée par nature_projet_origine.';
COMMENT ON COLUMN permis_caracteristique.nature_projet_origine IS
  'Origine de nature_projet : ''saisie'' | ''extraite'' | NULL (non renseigné). Alignée sur 103 (2 valeurs). Posée TOUJOURS avec la valeur.';
COMMENT ON COLUMN permis_caracteristique.surface_plancher_m2 IS
  'N7-C — surface de plancher DÉCLARÉE (m²), créée. CHECK >= 0. NULL = non renseigné. Portée par surface_plancher_m2_origine.';
COMMENT ON COLUMN permis_caracteristique.nb_logements IS
  'N7-C — nombre de logements DÉCLARÉ (CHECK >= 0). ⚠️ NULL et 0 DISTINCTS : NULL = aucun champ logement renseigné dans le Cerfa (indéterminé) ; 0 = zéro logement EXPLICITEMENT déclaré. Portée par nb_logements_origine.';
COMMENT ON COLUMN permis_caracteristique.nb_places_stationnement IS
  'N7-C — nombre de places de stationnement DÉCLARÉ après projet (CHECK >= 0). ⚠️ NULL et 0 DISTINCTS : NULL = non renseigné ; 0 = zéro place DÉCLARÉE dans le Cerfa. Distinct de la colonne parking (booléen de PRÉSENCE, 103, non touchée) : un éventuel couplage « 0 place » ↔ « parking=false » est une décision de MAPPING, pas de schéma. Portée par nb_places_stationnement_origine.';
COMMENT ON COLUMN permis_caracteristique.adresse_terrain IS
  'N7-C — adresse DÉCLARÉE du terrain (UNIQUE pour le permis). NULL = non renseignée. Donnée de localisation du projet (pas une donnée personnelle). Portée par adresse_terrain_origine.';

-- ─────────────────────────────────────────────────────────────────────────────
-- (2) permis_corps_batiment — ce qui vaut PAR IMMEUBLE (corps).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE permis_corps_batiment
  ADD COLUMN IF NOT EXISTS adresse         text,
  ADD COLUMN IF NOT EXISTS adresse_origine text    CONSTRAINT permis_corps_adresse_origine_chk CHECK (adresse_origine IN ('saisie','extraite'));

COMMENT ON COLUMN permis_corps_batiment.adresse IS
  'N7-C — adresse DÉCLARÉE de CE corps (une par immeuble quand un projet en compte plusieurs). NULL = non renseignée. Non remplissable aujourd''hui (attribution par corps non résolue, cf. N5-F/N7-A) ; colonne créée d''avance pour ne pas re-migrer. Portée par adresse_origine.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--
-- 1) COLONNES AJOUTÉES avec leur TYPE (attendu ci-contre) :
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--     WHERE table_name='permis_caracteristique'
--       AND column_name IN ('nature_projet','nature_projet_origine','surface_plancher_m2','surface_plancher_m2_origine',
--                           'nb_logements','nb_logements_origine','nb_places_stationnement','nb_places_stationnement_origine',
--                           'adresse_terrain','adresse_terrain_origine')
--     ORDER BY column_name;
--     -- attendu : nature_projet=text, surface_plancher_m2=numeric, nb_logements=integer, nb_places_stationnement=integer,
--     --           adresse_terrain=text, *_origine=text ; toutes is_nullable=YES.
--   SELECT column_name, data_type FROM information_schema.columns
--     WHERE table_name='permis_corps_batiment' AND column_name IN ('adresse','adresse_origine') ORDER BY column_name; -- text, text
--
-- 2) CHECK EFFECTIVEMENT POSÉS par 106 (origine à 2 valeurs, bornes >= 0, liste fermée nature) :
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conrelid='permis_caracteristique'::regclass AND contype='c'
--       AND conname IN ('permis_caract_nature_chk','permis_caract_nature_origine_chk','permis_caract_surface_chk',
--                       'permis_caract_surface_origine_chk','permis_caract_nblog_chk','permis_caract_nblog_origine_chk',
--                       'permis_caract_nbstat_chk','permis_caract_nbstat_origine_chk','permis_caract_adr_terrain_origine_chk')
--     ORDER BY conname;
--     -- attendu : *_origine_chk → IN ('saisie','extraite') ; *_surface_chk / *_nblog_chk / *_nbstat_chk → (… >= 0) ;
--     --           nature_chk → nature_projet IN ('habitation','bureaux','commerce','mixte','equipement','autre').
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conrelid='permis_corps_batiment'::regclass AND contype='c' AND conname='permis_corps_adresse_origine_chk';
--
-- 3) LES CHECK DE 103 SONT INCHANGÉS (mêmes 2 valeurs, non touchés) :
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conname IN ('permis_caract_parking_origine_chk','permis_corps_nb_etages_origine_chk',
--                       'permis_corps_alt_sommet_origine_chk','permis_corps_emprise_origine_chk')
--     ORDER BY conname;   -- toujours IN ('saisie','extraite') ; parking reste boolean (103).
--
-- 4) NÉGATIFS (doivent ÉCHOUER, transaction annulée) — choisir un dossier : SELECT id FROM sitadel_dossier LIMIT 1; (=<DID>)
--   -- BEGIN; INSERT INTO permis_caracteristique (dossier_id, nature_projet)            VALUES (<DID>, 'usine');   ROLLBACK; -- nature_chk (liste fermée)
--   -- BEGIN; INSERT INTO permis_caracteristique (dossier_id, nature_projet_origine)    VALUES (<DID>, 'auto');    ROLLBACK; -- nature_origine_chk (2 valeurs : 'auto' REFUSÉ)
--   -- BEGIN; INSERT INTO permis_caracteristique (dossier_id, surface_plancher_m2)      VALUES (<DID>, -1);        ROLLBACK; -- surface_chk (>= 0)
--   -- BEGIN; INSERT INTO permis_caracteristique (dossier_id, nb_logements)             VALUES (<DID>, -1);        ROLLBACK; -- nblog_chk (>= 0)
--   -- BEGIN; INSERT INTO permis_caracteristique (dossier_id, nb_places_stationnement)  VALUES (<DID>, -1);        ROLLBACK; -- nbstat_chk (>= 0)
--   -- BEGIN; INSERT INTO permis_corps_batiment   (dossier_id, adresse_origine)         VALUES (<DID>, 'auto');    ROLLBACK; -- adresse_origine_chk (2 valeurs)
--
-- 5) NULL ≠ 0 sur nb_logements ET nb_places_stationnement (les deux acceptés, distincts ; annulé) :
--   -- BEGIN;
--   --   INSERT INTO permis_caracteristique (dossier_id, nb_logements, nb_logements_origine, nb_places_stationnement, nb_places_stationnement_origine)
--   --     VALUES (<DID>, 0, 'saisie', 0, 'saisie')
--   --     ON CONFLICT (dossier_id) DO UPDATE SET nb_logements=0, nb_logements_origine='saisie', nb_places_stationnement=0, nb_places_stationnement_origine='saisie';
--   --   SELECT nb_logements, (nb_logements IS NULL) AS log_null, nb_places_stationnement, (nb_places_stationnement IS NULL) AS stat_null
--   --     FROM permis_caracteristique WHERE dossier_id=<DID>;   -- 0/false, 0/false
--   --   UPDATE permis_caracteristique SET nb_logements=NULL, nb_logements_origine=NULL, nb_places_stationnement=NULL, nb_places_stationnement_origine=NULL WHERE dossier_id=<DID>;
--   --   SELECT (nb_logements IS NULL) AS log_null, (nb_places_stationnement IS NULL) AS stat_null FROM permis_caracteristique WHERE dossier_id=<DID>;  -- true, true
--   -- ROLLBACK;
