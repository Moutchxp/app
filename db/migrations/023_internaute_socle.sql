-- 023_internaute_socle.sql — Module INTERNAUTE (base nominative), LOT 1 : SOCLE (schéma 3 blocs).
--
-- MOTIF : poser l'ossature d'une base nominative « privacy by design » (aujourd'hui INEXISTANTE — feuille
--   blanche). Trois blocs LOGIQUES SÉPARÉS reliés par l'UUID de la personne, selon
--   docs/ETUDE_architecture_data_module_internaute.md §1-4 :
--     • BLOC A — IDENTITÉ (qui)       : table `internaute`.
--     • BLOC B — CONSENTEMENT (droit) : `internaute_finalite` (référentiel) + `internaute_consentement_texte`
--                                       (textes versionnés) + `internaute_consentement` (preuves append-only)
--                                       + vue `internaute_consentement_actif` (INVARIANT « consentement actif »).
--     • BLOC C — PROJET (quoi)        : table `internaute_projet` (hybride : colonnes stables + payload jsonb versionné).
--
-- PORTÉE MINIMALE (LOT 1) : SCHÉMA + réceptacle SEULEMENT. Aucune ingestion depuis le tunnel (LOT 2), aucune
--   extraction/API/export (LOT 3+), aucun écran admin, aucune table de statut commercial ni de journal d'accès
--   (LOTS 3+). Ce fichier ne crée QUE la fondation data des 3 blocs.
--
-- CLÉ = UUID pour la PERSONNE (`internaute.id`, `gen_random_uuid()` — natif PostgreSQL 13+, AUCUNE extension
--   requise). ÉCART ASSUMÉ du `bigserial` habituel du repo, justifié RGPD : la clé d'une personne ne doit JAMAIS
--   être l'email (droit de rectification/effacement — étude §2.2). Les tables FILLES gardent `bigserial`
--   (convention repo + tie-break monotone pour « dernière décision »).
--
-- CLOISONNEMENT M2 (INVARIANT NON NÉGOCIABLE) : AUCUNE de ces tables n'a de clé étrangère, de colonne ou de lien
--   vers `analytics_*` NI vers `login_echec` (module M2 anonyme, k=11) ; AUCUN identifiant commun. Le nominatif et
--   l'anonyme ne se rejoignent jamais (limitation des finalités).
--
-- GOLDEN-SAFE : ce lot ne touche NI le moteur (`app/lib/svv/*`, `pipeline.ts`) NI aucune table géo/config du calcul
--   → le golden 29.107259068449615 est TRIVIALEMENT inchangé.
--
-- IDEMPOTENTE (`CREATE ... IF NOT EXISTS`, seeds `ON CONFLICT DO NOTHING`, `CREATE OR REPLACE VIEW`).
-- TRANSACTIONNELLE (`BEGIN;` … `COMMIT;`). ADDITIVE / NON DESTRUCTIVE (aucun DROP/TRUNCATE/DELETE/UPDATE).
--
-- ROLLBACK (non destructif, si vraiment nécessaire, et UNIQUEMENT via process validé — règle SVAV « pas de
--   suppression autonome ») :
--     DROP VIEW IF EXISTS internaute_consentement_actif;
--     DROP TABLE IF EXISTS internaute_projet, internaute_consentement, internaute_consentement_texte,
--                          internaute_finalite, internaute;
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/023_internaute_socle.sql
-- Vérification après application :
--   \dt internaute_*        → 5 tables (internaute, internaute_finalite, internaute_consentement_texte,
--                             internaute_consentement, internaute_projet)
--   \dv internaute_*        → 1 vue (internaute_consentement_actif)
--   SELECT * FROM internaute_finalite ORDER BY ordre;   → 3 finalités seed (F1/F2/F3)

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOC A — IDENTITÉ (qui). Une ligne = une personne physique. Clé = UUID (jamais l'email).
-- MINIMISATION : aucune donnée comportementale, aucune IP, aucune donnée analytique ici.
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS internaute (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  prenom               text,
  nom                  text,
  email                text,
  -- Téléphone E.164. NULLABLE — JAMAIS obligatoire par défaut (loi démarchage n° 2025-594 : opt-in prouvé au
  -- 11/08/2026 ; le numéro ne se collecte que si une finalité qui l'exige est consentie — cf. étude §2.1).
  telephone            text,
  source_collecte      text,       -- contexte de recueil (ex. 'formulaire_certificat')
  -- « Ne pas recontacter » : bloque la force commerciale (exploité au LOT 5). État non destructif.
  opposition_recontact boolean     NOT NULL DEFAULT false,
  cree_a               timestamptz NOT NULL DEFAULT now(),
  maj_a                timestamptz NOT NULL DEFAULT now()
  -- NB (à confirmer §7/DPO avant mise en ligne) : chiffrement AU REPOS de email/telephone (pgcrypto ou
  --   applicatif). En LOCAL, stockage texte ; la décision de chiffrement est un point subordonné, pas un blocage.
);

-- Unicité APPLICATIVE de l'email (anti-doublon), SANS en faire la clé : insensible à la casse, seulement si présent.
CREATE UNIQUE INDEX IF NOT EXISTS internaute_email_unique_idx
  ON internaute (lower(email)) WHERE email IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOC B — CONSENTEMENT (droit de traiter). Le cœur de la conformité.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Référentiel des FINALITÉS — EXTENSIBLE au runtime (nouvelle finalité = un INSERT, PAS une migration ni une
-- altération de CHECK ; même patron que `analytics_catalogue_evenement`, migration 018). Choisi plutôt qu'un CHECK
-- figé précisément pour l'évolutivité demandée (« nouvelle finalité future = pas de refonte »).
CREATE TABLE IF NOT EXISTS internaute_finalite (
  cle          text     PRIMARY KEY,           -- 'recontact_interne' | 'email_marketing' | 'retargeting_tiers' | (futures)
  libelle      text     NOT NULL,
  description  text,
  actif        boolean  NOT NULL DEFAULT true,
  ordre        smallint NOT NULL DEFAULT 0
);
INSERT INTO internaute_finalite (cle, libelle, description, ordre) VALUES
  ('recontact_interne', 'Recontact commercial interne', 'F1 — un spécialiste SVAV recontacte la personne (aucun tiers).', 1),
  ('email_marketing',   'Communications par email',     'F2 — envoi d''informations/opportunités par email (opt-in).',    2),
  ('retargeting_tiers', 'Ciblage publicitaire tiers',   'F3 — transmission à des tiers (Meta/Google). La plus sensible.',  3)
ON CONFLICT (cle) DO NOTHING;

-- TEXTES de consentement VERSIONNÉS : chaque version d'un texte, par finalité. Une preuve (ci-dessous) pointe la
-- version exacte VUE par la personne → on peut prouver À QUOI elle a consenti même après évolution des mentions.
CREATE TABLE IF NOT EXISTS internaute_consentement_texte (
  id            bigserial   PRIMARY KEY,
  finalite      text        NOT NULL REFERENCES internaute_finalite(cle),
  version       integer     NOT NULL,          -- version croissante par finalité
  contenu       text        NOT NULL,          -- texte/mention affiché (ou référence stable du gabarit)
  en_vigueur_a  timestamptz NOT NULL DEFAULT now(),
  cree_a        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (finalite, version)
);

-- CONSENTEMENTS (PREUVES) — APPEND-ONLY. Une ligne = (personne × finalité × décision datée).
-- RETRAIT = NOUVELLE ligne `etat='retire'` (JAMAIS d'UPDATE ni de DELETE) : l'historique est conservé, l'état
-- courant d'une finalité = la ligne la plus récente. `texte_id` = preuve de la version des mentions ; `canal` =
-- source de recueil (exigé notamment pour la preuve téléphonique, loi 2025-594).
CREATE TABLE IF NOT EXISTS internaute_consentement (
  id            bigserial   PRIMARY KEY,        -- surrogate monotone (tie-break « dernière décision »)
  internaute_id uuid        NOT NULL REFERENCES internaute(id),
  finalite      text        NOT NULL REFERENCES internaute_finalite(cle),
  etat          text        NOT NULL CHECK (etat IN ('accorde', 'refuse', 'retire')),
  horodatage    timestamptz NOT NULL DEFAULT now(),
  texte_id      bigint      REFERENCES internaute_consentement_texte(id),
  canal         text,
  cree_a        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS internaute_consentement_perso_final_idx
  ON internaute_consentement (internaute_id, finalite, horodatage DESC, id DESC);

-- INVARIANT STRUCTUREL — « consentement ACTIF ». Une ligne par (personne, finalité) = la DÉCISION LA PLUS RÉCENTE,
-- avec un booléen `actif` (= la dernière décision vaut 'accorde' ; ni refus ni retrait postérieurs).
-- Les LOTS 3+ interrogeront CETTE vue (`JOIN … WHERE finalite = … AND actif`) pour ne JAMAIS exploiter une donnée
-- non consentie. Tri déterministe : horodatage DESC puis id DESC (bigserial monotone).
CREATE OR REPLACE VIEW internaute_consentement_actif AS
SELECT DISTINCT ON (internaute_id, finalite)
       internaute_id,
       finalite,
       etat,
       horodatage,
       texte_id,
       (etat = 'accorde') AS actif
FROM internaute_consentement
ORDER BY internaute_id, finalite, horodatage DESC, id DESC;

-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOC C — PROJET (quoi). Évolutif par conception. HYBRIDE (étude §4.2) : champs STABLES nécessaires aux futurs
-- filtres commerciaux en COLONNES (LECTURE SEULE — issus du moteur/tunnel, le moteur n'est JAMAIS modifié) ; le
-- reste des réponses en `payload jsonb` VERSIONNÉ → nouveaux champs (parcours d'estimation…) sans migration ni
-- perte d'historique. Ingestion réelle = LOT 2 ; ici : RÉCEPTACLE seulement (colonnes nullable).
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS internaute_projet (
  id                   bigserial   PRIMARY KEY,
  internaute_id        uuid        NOT NULL REFERENCES internaute(id),
  version_tunnel       integer     NOT NULL,                      -- version du schéma de tunnel ayant produit le payload
  payload              jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- réponses brutes (champs mouvants / futurs)
  -- Colonnes STABLES promues (filtres commerciaux — remplies à l'ingestion, LOT 2). Toutes NULLABLE.
  verdict              text        CHECK (verdict IS NULL OR verdict IN ('SANS_VIS_A_VIS', 'VIS_A_VIS', 'INDETERMINE')),
  score                numeric,                                   -- note moteur (lecture seule ; jamais recalculée ici)
  etage                integer,
  dernier_etage        boolean,
  residence_principale boolean,
  commune_insee        text        CHECK (commune_insee IS NULL OR commune_insee ~ '^(2[AB]|[0-9]{2})[0-9]{3}$'),
  -- ⚠️ Position d'un LOGEMENT (donnée sensible) — conservée sous consentement, dans ce stockage nominatif SÉPARÉ de M2.
  lat                  double precision,
  lon                  double precision,
  adresse_saisie       text,
  adresse_normalisee   text,
  cree_a               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS internaute_projet_perso_idx ON internaute_projet (internaute_id);

COMMIT;
