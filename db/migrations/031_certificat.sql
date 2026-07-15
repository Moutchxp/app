-- 031_certificat.sql — SOCLE DU CERTIFICAT FIGÉ (Lot 1 de la chaîne d'émission).
--
-- MOTIF : un certificat « Sans Vis-à-Vis® » est un document qui FAIT FOI → IMMUABLE. Le projet internaute
--   (`internaute_projet`) peut muter (nouvelle analyse, rectification) ; le certificat, lui, FIGE un instantané
--   complet à l'instant de l'émission. Document immuable / acheminement mutable → TROIS tables :
--     1) certificat_compteur      — attribution atomique du numéro SAVV-AAAA-NNNNNN, repart à 1 chaque année ;
--     2) certificat               — l'instantané FIGÉ (trigger d'immuabilité : ni UPDATE ni DELETE) ;
--     3) certificat_acheminement  — le suivi (PDF, envoi, statut) qui, lui, BOUGE (pas de trigger).
--   Le RÉSULTAT est RE-DÉRIVÉ CÔTÉ SERVEUR à l'émission (déterministe, cf. golden), JAMAIS reçu du front.
--
-- PÉRIMÈTRE PROGRESSIF (Paris + 92 aujourd'hui) : RIEN ne présuppose un département. Tout ce qui dépend de la
--   COUVERTURE des données (cadastre, dalles LiDAR, altitudes, résultat hors couverture LiDAR) est NULLABLE.
--
-- ⚠️ node-pg (pour le Lot 2) : `numeric` revient en STRING côté JS ; `int8`/`bigserial` aussi. Coercer
--   explicitement (Number(...)) là où un nombre JS est attendu. Le driver `pg` ne parse PAS numeric en float
--   (précision préservée) — cohérent avec l'invariant « aucun arrondi ».
--
-- INVARIANTS respectés : AUCUN ARRONDI → toute grandeur mesurée en `numeric` SANS précision/échelle (jamais
--   numeric(x,y), jamais real/double precision). AUCUNE géométrie STOCKÉE : le point d'origine autoritatif = (lat,
--   lon) WGS84 ; sa projection Lambert-93 (EPSG:2154) est une DÉRIVÉE déterministe (ST_Transform), re-calculable à
--   la demande. ADDITIF + IDEMPOTENT (`CREATE TABLE/FUNCTION IF NOT EXISTS`, garde `pg_trigger`), aucun DROP, aucun
--   ALTER destructif, aucune donnée touchée. Le moteur n'est ni rappelé ni modifié ici → golden 29.107259068449615 inchangé.
--
-- RÉFÉRENTIEL DE BARÈME (ré-audit d'un vieux certificat) : `config_scoring` est un SINGLETON (`id = 1`, CHECK id=1),
--   MUTABLE, SANS versionnage natif (aucune colonne version/updated_at ; `config_edit_log` trace les modifs mais
--   n'épingle aucune version). Faute de version native, on FIGE deux marqueurs à l'émission (calculés au Lot 2) :
--     • config_generation = max(config_edit_log.id) à l'émission → marqueur MONOTONE (deux certificats de même
--       génération ont subi le même barème, aucune modif entre eux) ; NULL si le log est vide/indisponible ;
--     • config_empreinte  = hash SHA-256 (hex) du singleton config_scoring sérialisé canoniquement à l'émission →
--       empreinte IMMUABLE permettant de détecter toute dérive du barème (NOT NULL : un document qui fait foi ne
--       s'émet pas sans ancre de barème). config_id reste `1` aujourd'hui (singleton) — conservé pour l'explicite.
--
-- ══ POINTS OUVERTS (à traiter dans des lots dédiés) ══
--  1. config_scoring SANS versionnage natif : `config_empreinte` + `config_generation` IDENTIFIENT et VÉRIFIENT le
--     barème d'un certificat, ils ne le RECONSTITUENT pas. Un SNAPSHOT de config figé (table d'historique) reste à
--     construire (lot séparé). NB : le VERDICT binaire (1er obstacle ≥ 40 m) NE DÉPEND PAS du barème — seul le
--     SCORE /100 en dépend ; l'empreinte n'est donc critique que pour ré-auditer le score, pas le verdict.
--  2. IMMUABILITÉ vs EFFACEMENT RGPD : le trigger d'immuabilité + la FK `projet_id` rendent IMPOSSIBLE la suppression
--     d'un `internaute_projet` référencé (le bloc C ne peut plus être effacé). À TRANCHER AVANT LA PREMIÈRE ÉMISSION
--     EN PRODUCTION, pas plus tard. (Le certificat recopiant TOUTES ses entrées, il peut survivre à l'effacement du
--     projet — comme le bloc B des preuves de consentement.)
--
-- ROLLBACK (non destructif de données ; à n'exécuter que sciemment, hors process nominal) :
--   DROP TRIGGER IF EXISTS certificat_immuable ON certificat;
--   DROP TABLE IF EXISTS certificat_acheminement; DROP TABLE IF EXISTS certificat; DROP TABLE IF EXISTS certificat_compteur;
--   DROP FUNCTION IF EXISTS certificat_interdire_modification();
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/031_certificat.sql
-- Vérification : \d certificat ; \d certificat_compteur ; \d certificat_acheminement ;
--   -- l'immuabilité (doit ÉCHOUER) : UPDATE certificat SET score = 0 WHERE false;  DELETE FROM certificat WHERE false;

BEGIN;

-- ════════════════ TABLE 1 — certificat_compteur ════════════════
-- Attribution ATOMIQUE de NNNNNN par année. Requête d'attribution prévue (Lot 2, NON implémentée ici) — le
-- ON CONFLICT DO UPDATE prend un VERROU DE LIGNE → deux demandes simultanées sérialisent, jamais le même numéro :
--   INSERT INTO certificat_compteur (annee, dernier) VALUES ($1, 1)
--     ON CONFLICT (annee) DO UPDATE SET dernier = certificat_compteur.dernier + 1
--     RETURNING dernier;
CREATE TABLE IF NOT EXISTS certificat_compteur (
  annee   integer PRIMARY KEY,
  dernier integer NOT NULL DEFAULT 0 CHECK (dernier >= 0)
);

COMMENT ON TABLE certificat_compteur IS
  'Compteur séquentiel du numéro de certificat, PAR ANNÉE (repart à 1 chaque année). Attribution atomique par ON CONFLICT DO UPDATE (verrou de ligne).';

-- ════════════════ TABLE 2 — certificat (IMMUABLE) ════════════════
CREATE TABLE IF NOT EXISTS certificat (
  id                     bigserial   PRIMARY KEY,
  -- Identité
  numero                 text        NOT NULL UNIQUE CHECK (numero ~ '^SAVV-[0-9]{4}-[0-9]{6}$'),
  projet_id              bigint      NOT NULL REFERENCES internaute_projet(id),  -- analyse d'origine (traçabilité)
  emis_le                timestamptz NOT NULL DEFAULT now(),
  -- Référentiel de barème figé (cf. en-tête : config_scoring n'a pas de versionnage natif)
  config_id              integer     NOT NULL DEFAULT 1,      -- singleton config_scoring (toujours 1 aujourd'hui)
  config_generation      bigint,                              -- max(config_edit_log.id) à l'émission ; NULL si log vide
  config_empreinte       text        NOT NULL,                -- hash SHA-256 du singleton config_scoring à l'émission
  -- Entrées RECOPIÉES (snapshot : le projet peut muter, pas le certificat).
  -- Point d'origine AUTORITATIF = (lat, lon) WGS84. Sa projection Lambert-93 (EPSG:2154) est une DÉRIVÉE
  -- déterministe (ST_Transform), re-calculable à la demande (carte, cadastre, dalles LiDAR) → NON stockée : une
  -- table immuable ne conserve pas deux représentations de la même vérité.
  lat                    numeric,                             -- WGS84 (recopié de internaute_projet)
  lon                    numeric,
  azimut_deg             numeric,
  etage                  integer,
  dernier_etage          boolean,
  hauteur_sous_plafond_m numeric,
  hauteur_vision_m       numeric,
  adresse                text,
  type_bien              text,
  surface_m2             numeric,
  nb_pieces              integer,
  epoque                 text,                                -- époque déclarative (approximative) saisie au tunnel
  -- Résultat RE-DÉRIVÉ serveur (verdict = valeurs RÉELLES du moteur ; le reste NULLABLE : dépend de la couverture)
  verdict                text        NOT NULL CHECK (verdict IN ('SANS_VIS_A_VIS', 'VIS_A_VIS', 'INDETERMINE')),
  score                  numeric,                             -- /100, sans arrondi
  distance_obstacle_m    numeric,                             -- distance du 1er obstacle réel sur l'axe principal
  profondeur_moyenne_m   numeric,                             -- moyenne de profondeur des faisceaux
  faisceaux_degages_pct  numeric,                             -- pourcentage de faisceaux dégagés
  altitude_terrain_m     numeric,                             -- MNT au point d'origine
  altitude_sol_m         numeric,                             -- sol / BD TOPO
  tolerance_m            numeric,
  -- Provenance (couverture-dépendante → NULLABLE)
  dalles_mnt_nombre      integer,                             -- dalles MNT lues (lecture au point d'origine)
  dalles_mns_nombre      integer,                             -- dalles MNS lues (le long du couloir d'analyse)
  reference_cadastrale   text,                                -- commune+section+numéro si parcelle trouvée, sinon NULL (hors 92 aujourd'hui)
  annee_batiment         integer,                             -- année BD TOPO du bâtiment si disponible
  -- Snapshot intégral (audit)
  resultat               jsonb       NOT NULL,                -- sortie COMPLÈTE du pipeline telle que re-dérivée
  analyse_photo          jsonb,                               -- bloc photo-IA (voir COMMENT : non déterministe, daté de l'émission)
  -- Fichiers (clés d'objet MinIO ; NULL à ce stade — remplies aux lots photo/carte)
  photo_cle              text,
  carte_orientation_cle  text
);

COMMENT ON TABLE certificat IS
  'Certificat « Sans Vis-à-Vis® » — instantané IMMUABLE (ni UPDATE ni DELETE, cf. trigger certificat_immuable). Résultat re-dérivé serveur à l''émission, jamais reçu du front. Entrées recopiées (le projet peut muter).';
COMMENT ON COLUMN certificat.analyse_photo IS
  'Bloc photo-IA (vue nature / immobilier / nuisances) : NON DÉTERMINISTE (IA Gemini) et daté de l''ÉMISSION — jamais présenté comme une mesure certifiée ; conservé à titre déclaratif/audit.';
COMMENT ON COLUMN certificat.config_empreinte IS
  'Empreinte SHA-256 du singleton config_scoring à l''émission (barème figé). config_scoring n''ayant pas de versionnage natif, c''est l''ancre de ré-audit ; voir aussi config_generation (max config_edit_log.id).';

CREATE INDEX IF NOT EXISTS certificat_projet_idx ON certificat (projet_id);
CREATE INDEX IF NOT EXISTS certificat_emis_idx   ON certificat (emis_le);

-- ── GARDE-FOU D'IMMUABILITÉ : une ligne de certificat ne se réécrit ni ne s'efface, JAMAIS. ──
CREATE OR REPLACE FUNCTION certificat_interdire_modification() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'certificat IMMUABLE : ni UPDATE ni DELETE autorisé (id=%, numero=%).', OLD.id, OLD.numero;
  RETURN NULL; -- inatteignable (RAISE interrompt), présent pour la forme
END;
$$;

-- Création idempotente SANS DROP (garde sur pg_trigger).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'certificat_immuable' AND NOT tgisinternal
      AND tgrelid = 'certificat'::regclass
  ) THEN
    CREATE TRIGGER certificat_immuable
      BEFORE UPDATE OR DELETE ON certificat
      FOR EACH ROW EXECUTE FUNCTION certificat_interdire_modification();
  END IF;
END;
$$;

-- ════════════════ TABLE 3 — certificat_acheminement (MUTABLE) ════════════════
CREATE TABLE IF NOT EXISTS certificat_acheminement (
  id             bigserial   PRIMARY KEY,
  certificat_id  bigint      NOT NULL REFERENCES certificat(id),
  pdf_cle        text,                                        -- clé d'objet MinIO du PDF (NULL tant que non généré)
  genere_le      timestamptz,                                 -- horodatage de génération du PDF
  envoye_le      timestamptz,                                 -- horodatage de l'envoi e-mail
  statut         text        NOT NULL DEFAULT 'en_attente'
                   CHECK (statut IN ('en_attente', 'genere', 'envoye', 'echec')),
  derniere_erreur text,                                       -- message de la dernière erreur d'acheminement
  cree_a         timestamptz NOT NULL DEFAULT now(),
  maj_a          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE certificat_acheminement IS
  'Suivi MUTABLE de l''acheminement d''un certificat (génération PDF, envoi, statut, dernière erreur). PAS d''immuabilité ici : cet état bouge.';

CREATE INDEX IF NOT EXISTS certificat_acheminement_certificat_idx ON certificat_acheminement (certificat_id);
CREATE INDEX IF NOT EXISTS certificat_acheminement_statut_idx     ON certificat_acheminement (statut);

COMMIT;
