-- 116_rattachement_dossier_altitude.sql — Module VEILLE PERMIS (chantier FUS-3a) : SOCLE de données du rattachement d'un permis à
-- sa parcelle / ses polygones futurs, + PRÉSÉANCE LiDAR sur l'altitude des polygones. AUCUN écran ici (FUS-3b).
--
-- TROIS tables :
--  1) permis_rattachement — le DOSSIER de décision (un permis = une ligne, RÉÉVALUÉ en place à chaque livraison). Fige, à la
--     détection, ce qu'a vu le moteur FUS-2 : parcelle candidate, régime, verdict, critères + valeurs MESURÉES, SEUILS
--     EFFECTIVEMENT UTILISÉS + provenance, millésimes des sources, polygones concernés. Porte un ÉTAT qui se réévalue :
--       en_attente_bati    — fusion détectée (surface+bordure) mais polygone pas encore livré ;
--       arbitrage_demande  — plusieurs polygones/corps sans discriminant fiable (décision humaine attendue) ;
--       valide             — rattaché (automatiquement par le moteur, ou par un humain en FUS-3b) — par qui, quand ;
--       refuse             — écarté — par qui, quand, motif ;
--       annule_par_lidar   — une nouvelle mesure LiDAR a écrasé l'altitude injectée par un permis validé (cf. table 3).
--  2) permis_rattachement_evenement — HISTORIQUE append-only (détection, réévaluations, transitions, écrasements/retours
--     d'altitude) → « on doit pouvoir raconter l'histoire ». La réévaluation UPDATE le dossier ; l'historique n'est jamais perdu.
--  3) permis_polygone_altitude — l'ALTITUDE d'un polygone (par cleabs) et son ORIGINE. C'est le CŒUR du chantier (voir ci-dessous).
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗
-- ║ 🔴 PRÉSÉANCE LiDAR — INVARIANT INVERSÉ. LIRE DEUX FOIS AVANT DE « CORRIGER ».                                             ║
-- ║ Partout ailleurs dans l'app : « une SAISIE n'est JAMAIS écrasée » (origine='saisie' protégée de l'extraction).            ║
-- ║ ICI C'EST L'INVERSE : une altitude d'origine 'permis' DOIT être écrasée par une nouvelle mesure LiDAR.                    ║
-- ║   · Le LiDAR MESURE (la réalité du toit construit) ; le permis DÉCLARE (une intention, provisoire tant que non mesurée).  ║
-- ║   · Donc `altitude_origine` ∈ {'lidar','permis'} et une mesure LiDAR écrase TOUJOURS, y compris un 'permis' VALIDÉ         ║
-- ║     → le dossier passe alors à `annule_par_lidar`.                                                                        ║
-- ║   · `altitude_lidar_refige` = l'altitude LiDAR figée JUSTE AVANT l'écrasement par le permis (PAS celle du snapshot         ║
-- ║     d'analyse : BD TOPO a pu être remesurée entre-temps, et le « retour arrière » restaurerait sinon une valeur périmée). ║
-- ║ NE PAS « réparer » ce comportement en croyant corriger un bug : ce serait garder une valeur déclarée périmée par la vraie ║
-- ║ mesure. La règle pure vit dans app/lib/permis/preseanceAltitude.ts, avec un test qui CASSE si la préséance est inversée.  ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝
--
-- SÛR : DDL strictement ADDITIVE (CREATE TABLE / INDEX … IF NOT EXISTS). Aucun DROP, aucun UPDATE, aucune colonne existante
-- touchée. Ne touche NI le moteur de verdict SVAV NI le golden. Idempotente. Un seul BEGIN/COMMIT. Requiert 047 (sitadel_dossier).
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/116_rattachement_dossier_altitude.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS.

BEGIN;

-- 1) DOSSIER de rattachement — un permis = une ligne, réévalué en place.
CREATE TABLE IF NOT EXISTS permis_rattachement (
  id                     serial      PRIMARY KEY,
  dossier_id             bigint      NOT NULL REFERENCES sitadel_dossier(id) ON DELETE CASCADE,
  parcelle_candidate_idu text,                                   -- IDU de la parcelle candidate (régime avec fusion) ; NULL sinon
  regime                 text        NOT NULL,                   -- avec_fusion | sans_fusion | indetermine (FUS-2)
  verdict                text        NOT NULL,                   -- RATTACHEMENT_AUTOMATIQUE | ARBITRAGE_DEMANDE | RIEN (verdict moteur)
  etat                   text        NOT NULL DEFAULT 'en_attente_bati'
                           CONSTRAINT permis_rattachement_etat_chk
                           CHECK (etat IN ('en_attente_bati','arbitrage_demande','valide','refuse','annule_par_lidar')),
  motif                  text,
  criteres               jsonb,                                  -- critères + valeurs MESURÉES { surface:{ratio,seuil,franchi}, bordure:{...}, bati:{...} }
  seuils_utilises        jsonb,                                  -- seuils EFFECTIVEMENT utilisés { seuilSurface, seuilBordure, margeAltitudeM }
  seuils_provenance      text,                                   -- 'base' (config_veille) | 'defaut' (migration 115 non appliquée)
  polygones_concernes    jsonb       NOT NULL DEFAULT '[]'::jsonb, -- [{cleabs, etat:'nouveau'|'modifie'}]
  millesime_cadastre     text,                                   -- millésime cadastral (empreinte)
  millesime_bati         text,                                   -- millésime/état de la couche bâti (snapshot FUS-1b)
  valide_par             text, valide_le timestamptz,            -- si etat=valide : par qui, quand ('moteur:auto' si rattachement automatique)
  refuse_par             text, refuse_le timestamptz, refus_motif text, -- si etat=refuse : par qui, quand, pourquoi
  detecte_le             timestamptz NOT NULL DEFAULT now(),
  reevalue_le            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dossier_id)                                            -- un dossier de rattachement par permis (réévalué, jamais dupliqué)
);
CREATE INDEX IF NOT EXISTS permis_rattachement_etat_idx     ON permis_rattachement (etat);
CREATE INDEX IF NOT EXISTS permis_rattachement_candidate_idx ON permis_rattachement (parcelle_candidate_idu);

-- 2) HISTORIQUE append-only — la réévaluation UPDATE le dossier ; ici on garde le récit complet (jamais perdu).
CREATE TABLE IF NOT EXISTS permis_rattachement_evenement (
  id              bigserial   PRIMARY KEY,
  rattachement_id bigint      NOT NULL REFERENCES permis_rattachement(id) ON DELETE CASCADE,
  type            text        NOT NULL,   -- detection | reevaluation | validation | refus | annulation_lidar | ecrasement_altitude | retour_altitude
  ancien_etat     text,
  nouvel_etat     text,
  details         jsonb,                  -- valeurs mesurées, verdict, altitude avant/après, provenance, millésimes…
  survenu_le      timestamptz NOT NULL DEFAULT now(),
  par             text
);
CREATE INDEX IF NOT EXISTS permis_rattachement_evenement_ratt_idx ON permis_rattachement_evenement (rattachement_id, survenu_le);

-- 3) ALTITUDE d'un polygone + son ORIGINE — 🔴 CŒUR DU CHANTIER (préséance LiDAR, cf. cartouche en tête de fichier).
CREATE TABLE IF NOT EXISTS permis_polygone_altitude (
  cleabs                   text        PRIMARY KEY,             -- identité BD TOPO du polygone
  altitude_ngf             numeric,                             -- altitude EFFECTIVE courante (NGF absolu)
  altitude_origine         text        CONSTRAINT permis_polygone_altitude_origine_chk CHECK (altitude_origine IN ('lidar','permis')),
  altitude_lidar_refige    numeric,                             -- 🔴 LiDAR figée JUSTE AVANT un écrasement 'permis' (pour le retour arrière) ; JAMAIS celle du snapshot d'analyse
  altitude_lidar_refige_le timestamptz,
  dossier_id               bigint      REFERENCES sitadel_dossier(id) ON DELETE SET NULL, -- permis ayant injecté l'altitude (origine='permis')
  maj_le                   timestamptz NOT NULL DEFAULT now(),
  maj_par                  text
);

COMMENT ON TABLE permis_rattachement IS 'FUS-3a — DOSSIER de rattachement (un permis = une ligne, réévalué en place). Fige le verdict FUS-2, les critères mesurés, les seuils utilisés + leur provenance, les millésimes. `etat` se réévalue (en_attente_bati / arbitrage_demande / valide / refuse / annule_par_lidar). Historique dans permis_rattachement_evenement.';
COMMENT ON TABLE permis_rattachement_evenement IS 'FUS-3a — HISTORIQUE append-only du dossier de rattachement : chaque détection, réévaluation, transition d''état, écrasement/retour d''altitude. Permet de raconter l''histoire complète (auditabilité).';
COMMENT ON TABLE permis_polygone_altitude IS 'FUS-3a — altitude d''un polygone (par cleabs) et son ORIGINE. 🔴 PRÉSÉANCE INVERSÉE : le LiDAR (mesure) écrase TOUJOURS le permis (déclaration), y compris validé → dossier annule_par_lidar. Voir cartouche de la migration 116 et preseanceAltitude.ts.';
COMMENT ON COLUMN permis_polygone_altitude.altitude_origine IS 'FUS-3a — origine de l''altitude COURANTE : ''lidar'' (mesure, fait foi) ou ''permis'' (déclaration provisoire). 🔴 INVARIANT INVERSÉ vs ''saisie protégée'' : une mesure LiDAR écrase TOUJOURS un ''permis'', même validé. NE PAS protéger ''permis'' : ce serait garder une valeur déclarée périmée par la mesure réelle.';
COMMENT ON COLUMN permis_polygone_altitude.altitude_lidar_refige IS 'FUS-3a — altitude LiDAR figée JUSTE AVANT l''écrasement par le permis (relue à l''instant de l''injection, PAS celle du snapshot d''analyse : BD TOPO a pu être remesurée). Sert au RETOUR ARRIÈRE manuel, qui restaure cette valeur (à jour) et repasse l''origine à ''lidar''.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (S'EXÉCUTE quand tu lances le fichier — AFFICHE le résultat) :
\echo '>>> tables du socle rattachement :'
SELECT table_name FROM information_schema.tables WHERE table_name IN ('permis_rattachement','permis_rattachement_evenement','permis_polygone_altitude') ORDER BY table_name;
\echo '>>> états autorisés du dossier (CHECK) :'
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'permis_rattachement_etat_chk';
\echo '>>> colonnes de préséance d''altitude + CHECK origine :'
SELECT column_name, udt_name FROM information_schema.columns WHERE table_name = 'permis_polygone_altitude' AND column_name LIKE 'altitude\_%' ORDER BY ordinal_position;
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'permis_polygone_altitude_origine_chk';
