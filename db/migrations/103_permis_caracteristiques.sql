-- 103_permis_caracteristiques.sql — Module VEILLE PERMIS (chantier N3-B) : CARACTÉRISTIQUES PHYSIQUES d'un permis.
-- ⚠️ POURQUOI : Sitadel ne porte NI hauteur, NI nombre d'étages, NI emprise bâtie (recon N3-A). On crée ici deux tables pour
-- stocker ces faits, alimentés PLUS TARD par saisie manuelle ou extraction assistée depuis la GED :
--   (1) permis_caracteristique — le GLOBAL d'un permis (1 ligne par permis) : parking, commentaire.
--   (2) permis_corps_batiment — N CORPS de bâtiment par permis (le décroché) : étages, sous-sols, altitudes NGF, hauteur, emprise.
-- Chaque VALEUR physique est accompagnée de son ORIGINE ('saisie' = à la main | 'extraite' = automatique | NULL = non renseigné) :
-- une case vide reste ainsi distinguable d'un zéro, et l'invariant « l'automatique n'écrase pas une saisie » (porté par le DÉPÔT
-- code, PAS ce schéma) peut s'appuyer dessus. La TRAÇABILITÉ « quelle pièce, quelle page » N'EST PAS ici (elle vivra dans les
-- propositions de N5) : on ne stocke que la valeur RETENUE et son origine.
--
-- FK = dossier_id BIGINT → sitadel_dossier(id) (id technique), comme dossier_document et demande_dossier ; la clé (type, num_dau)
-- n'est JAMAIS une FK. Emprise en Lambert-93 (EPSG:2154), cohérent avec le reste du moteur ; créée maintenant, restera vide (on ne
-- migrera pas deux fois). Les CHECK de plage sont écrits UNE PAR COLONNE, forme « col >= min AND col <= max », pour que l'écran
-- (motif PlageParam / parserBornesCheck) lise les bornes DEPUIS la base sans jamais les recopier en dur côté code.
--
-- SÛR : DDL strictement ADDITIVE (CREATE TABLE/INDEX IF NOT EXISTS). Aucun DROP, aucun UPDATE, aucun trigger, aucun backfill. Ne
-- touche NI le moteur de score (golden 29.107259068449615 intact), NI aucune table existante. Idempotente. Un seul BEGIN/COMMIT.
-- Requiert 047 (sitadel_dossier) et PostGIS (001). Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/103_permis_caracteristiques.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer. TU NE L'APPLIQUES PAS.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- (1) permis_caracteristique — le GLOBAL d'un permis (1 ligne par permis).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permis_caracteristique (
  dossier_id       bigint       PRIMARY KEY REFERENCES sitadel_dossier(id) ON DELETE CASCADE, -- NOT NULL + UNIQUE (1:1 permis)
  parking          boolean,                                            -- présence d'un parking (NULL = non renseigné, ≠ « non »)
  parking_origine  text         CONSTRAINT permis_caract_parking_origine_chk CHECK (parking_origine IN ('saisie','extraite')),
  commentaire      text,                                               -- note libre (sans origine : c'est un commentaire humain)
  maj_le           timestamptz,
  maj_par          text
);

COMMENT ON TABLE permis_caracteristique IS
  'N3-B — caractéristiques GLOBALES d''un permis (1 ligne par permis, clé = dossier_id → sitadel_dossier.id). Alimentée à la main OU par extraction assistée (GED). parking porte son ORIGINE (''saisie''|''extraite''|NULL) ; commentaire est une note humaine sans origine. La traçabilité pièce/page n''est PAS ici (propositions N5).';
COMMENT ON COLUMN permis_caracteristique.parking IS 'Présence d''un parking. NULL = non renseigné (distinct de « non »).';
COMMENT ON COLUMN permis_caracteristique.parking_origine IS 'Origine de parking : ''saisie'' (à la main) | ''extraite'' (auto) | NULL (non renseigné). Posée TOUJOURS avec la valeur.';

-- ─────────────────────────────────────────────────────────────────────────────
-- (2) permis_corps_batiment — N CORPS de bâtiment par permis (le décroché).
--   Chaque valeur physique + son ORIGINE. CHECK de plage UNE PAR COLONNE (bornes lues par l'écran depuis la base). NULL toléré
--   partout (non renseigné) : une valeur hors bornes est refusée, mais NULL et 0 restent distincts.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permis_corps_batiment (
  id                                bigserial   PRIMARY KEY,
  dossier_id                        bigint      NOT NULL REFERENCES sitadel_dossier(id) ON DELETE CASCADE,
  repere                            text,                                 -- nom du corps sur les plans : « A1 », « 2D1 » (NULL = non nommé)

  nb_etages                         integer     CONSTRAINT permis_corps_nb_etages_chk               CHECK (nb_etages >= 0 AND nb_etages <= 70),
  nb_etages_origine                 text        CONSTRAINT permis_corps_nb_etages_origine_chk       CHECK (nb_etages_origine IN ('saisie','extraite')),

  nb_niveaux_sous_sol               integer     CONSTRAINT permis_corps_nb_ss_chk                   CHECK (nb_niveaux_sous_sol >= 0 AND nb_niveaux_sous_sol <= 10),
  nb_niveaux_sous_sol_origine       text        CONSTRAINT permis_corps_nb_ss_origine_chk           CHECK (nb_niveaux_sous_sol_origine IN ('saisie','extraite')),

  altitude_dernier_plancher_ngf     numeric     CONSTRAINT permis_corps_alt_plancher_chk            CHECK (altitude_dernier_plancher_ngf >= -50 AND altitude_dernier_plancher_ngf <= 500),
  altitude_dernier_plancher_ngf_origine text    CONSTRAINT permis_corps_alt_plancher_origine_chk    CHECK (altitude_dernier_plancher_ngf_origine IN ('saisie','extraite')),

  altitude_sommet_ngf               numeric     CONSTRAINT permis_corps_alt_sommet_chk              CHECK (altitude_sommet_ngf >= -50 AND altitude_sommet_ngf <= 500),
  altitude_sommet_ngf_origine       text        CONSTRAINT permis_corps_alt_sommet_origine_chk      CHECK (altitude_sommet_ngf_origine IN ('saisie','extraite')),

  hauteur_relative_m                numeric     CONSTRAINT permis_corps_hauteur_chk                 CHECK (hauteur_relative_m >= 0 AND hauteur_relative_m <= 300),
  hauteur_relative_m_origine        text        CONSTRAINT permis_corps_hauteur_origine_chk         CHECK (hauteur_relative_m_origine IN ('saisie','extraite')),

  altitude_terrain_naturel_ngf      numeric     CONSTRAINT permis_corps_alt_terrain_chk             CHECK (altitude_terrain_naturel_ngf >= -50 AND altitude_terrain_naturel_ngf <= 500),
  altitude_terrain_naturel_ngf_origine text     CONSTRAINT permis_corps_alt_terrain_origine_chk     CHECK (altitude_terrain_naturel_ngf_origine IN ('saisie','extraite')),

  emprise                           geometry(Polygon, 2154),              -- emprise bâtie du corps (L93/2154). Créée maintenant, reste vide.
  emprise_origine                   text        CONSTRAINT permis_corps_emprise_origine_chk         CHECK (emprise_origine IN ('saisie','extraite')),

  maj_le                            timestamptz,
  maj_par                           text
);

COMMENT ON TABLE permis_corps_batiment IS
  'N3-B — un CORPS de bâtiment d''un permis (N par permis, clé = dossier_id → sitadel_dossier.id). Le « décroché » : chaque corps a ses étages/sous-sols/altitudes NGF/hauteur/emprise, CHACUN avec son origine (''saisie''|''extraite''|NULL). Bornes des CHECK lues par l''écran DEPUIS la base (jamais recopiées). Traçabilité pièce/page hors périmètre (propositions N5).';
COMMENT ON COLUMN permis_corps_batiment.repere IS 'Nom du corps tel qu''il figure sur les plans (« A1 », « 2D1 »). NULL = non nommé.';
COMMENT ON COLUMN permis_corps_batiment.hauteur_relative_m IS 'Hauteur du corps au-dessus du terrain naturel (m). NULL = non renseigné (≠ 0).';
COMMENT ON COLUMN permis_corps_batiment.emprise IS 'Emprise bâtie du corps, polygone Lambert-93 (EPSG:2154). Créée pour ne pas migrer deux fois ; reste vide tant qu''aucune extraction ne la pose.';

CREATE INDEX IF NOT EXISTS permis_corps_batiment_dossier_idx ON permis_corps_batiment (dossier_id);

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--   \d permis_caracteristique
--   \d permis_corps_batiment
--   SELECT count(*) FROM permis_caracteristique;   -- 0 au départ
--   SELECT count(*) FROM permis_corps_batiment;    -- 0 au départ
--   SELECT indexname FROM pg_indexes WHERE tablename = 'permis_corps_batiment';  -- ..._dossier_idx présent
--   -- Bornes lisibles par l'écran (parserBornesCheck) :
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'permis_corps_batiment'::regclass AND contype='c';
--
--   -- Choisir un dossier réel : SELECT id FROM sitadel_dossier LIMIT 1;   (remplacer <DID> ci-dessous)
--   -- POSITIF (NULL ≠ 0 : les deux acceptés, et distincts) :
--   -- BEGIN;
--   --   INSERT INTO permis_corps_batiment (dossier_id, repere, nb_etages) VALUES (<DID>, 'vide', NULL);
--   --   INSERT INTO permis_corps_batiment (dossier_id, repere, nb_etages, nb_etages_origine, altitude_sommet_ngf, altitude_sommet_ngf_origine)
--   --                              VALUES (<DID>, 'zero', 0, 'saisie', 0, 'saisie');
--   --   SELECT repere, nb_etages, (nb_etages IS NULL) AS est_null FROM permis_corps_batiment WHERE dossier_id=<DID>;  -- « vide » NULL/true, « zero » 0/false
--   -- ROLLBACK;
--
--   -- NÉGATIFS (doivent ÉCHOUER, en transaction annulée) :
--   -- BEGIN; INSERT INTO permis_corps_batiment (dossier_id, nb_etages)            VALUES (<DID>, 100);        ROLLBACK;  -- viole nb_etages_chk (0..70)
--   -- BEGIN; INSERT INTO permis_corps_batiment (dossier_id, nb_niveaux_sous_sol)  VALUES (<DID>, 20);         ROLLBACK;  -- viole nb_ss_chk (0..10)
--   -- BEGIN; INSERT INTO permis_corps_batiment (dossier_id, altitude_sommet_ngf)  VALUES (<DID>, 1000);       ROLLBACK;  -- viole alt_sommet_chk (-50..500)
--   -- BEGIN; INSERT INTO permis_corps_batiment (dossier_id, hauteur_relative_m)   VALUES (<DID>, 400);        ROLLBACK;  -- viole hauteur_chk (0..300)
--   -- BEGIN; INSERT INTO permis_corps_batiment (dossier_id, nb_etages_origine)    VALUES (<DID>, 'auto');     ROLLBACK;  -- viole nb_etages_origine_chk (IN saisie/extraite)
--   -- BEGIN; INSERT INTO permis_corps_batiment (dossier_id)                       VALUES (999999999);         ROLLBACK;  -- viole la FK dossier_id
--
--   -- CASCADE (doit supprimer les caractéristiques quand le dossier disparaît ; annulé) :
--   -- BEGIN;
--   --   INSERT INTO permis_corps_batiment (dossier_id, repere) VALUES (<DID>, 'casc');
--   --   DELETE FROM sitadel_dossier WHERE id=<DID>;
--   --   SELECT count(*) FROM permis_corps_batiment WHERE dossier_id=<DID>;  -- 0 (cascade)
--   -- ROLLBACK;
