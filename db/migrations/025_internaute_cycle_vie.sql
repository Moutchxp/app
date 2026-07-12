-- 025_internaute_cycle_vie.sql — Module INTERNAUTE, LOT 4 : CYCLE DE VIE (droits + rétention).
--
-- MOTIF : outiller le droit à l'effacement / la rectification / la purge à échéance de la base nominative, selon
--   la RÈGLE ASYMÉTRIQUE (étude §6-7) : un effacement anonymise l'IDENTITÉ (bloc A) et supprime le PROJET (bloc C),
--   mais CONSERVE la PREUVE de consentement (bloc B) — défense en cas de contrôle. Cette migration pose les 3
--   objets nécessaires :
--     1. colonne `internaute.efface_a` (marqueur d'anonymisation en place — l'UUID reste le pivot des preuves B) ;
--     2. `internaute_retention` : durées de conservation PARAMÉTRABLES au runtime (« pilotage sans code ») ;
--     3. `internaute_cycle_vie_log` : journal append-only des opérations (accountability).
--
-- STRATÉGIE D'EFFACEMENT = ANONYMISATION EN PLACE : on NE supprime PAS la ligne `internaute` (sinon la FK des
--   preuves B casserait ou imposerait de toucher `internaute_consentement`, qui est APPEND-ONLY). On garde la ligne
--   + son UUID, on NULLifie les PII (prénom/nom/email/téléphone), on pose `efface_a`, et on supprime les lignes
--   `internaute_projet` (C). Les preuves B restent INTACTES, rattachées à l'UUID anonymisé → intégrité + preuve.
--
-- ⚠️ DURÉES = PROVISOIRES. Les valeurs seed ci-dessous sont des PLACEHOLDERS « à fixer avec le juriste/DPO »
--   (étude §8). La MÉCANIQUE est réelle ; les VALEURS ne le sont pas. Ne pas mettre en ligne sans validation.
--
-- CLOISONNEMENT M2 (INVARIANT) : aucune FK/colonne vers `analytics_*` ni `login_echec`. `utilisateur_id` du journal
--   → `admin_utilisateur` (auteur admin), jamais un internaute ni une session analytique.
--
-- GOLDEN-SAFE : aucun contact avec le moteur → golden 29.107259068449615 trivialement inchangé.
--
-- IDEMPOTENTE (`ADD COLUMN/CREATE ... IF NOT EXISTS`, seed `ON CONFLICT DO NOTHING`). TRANSACTIONNELLE.
--   ADDITIVE / NON DESTRUCTIVE (aucun DROP/TRUNCATE/DELETE/UPDATE ; `ADD COLUMN` n'écrase aucune donnée).
--
-- ROLLBACK (non destructif, process validé uniquement) :
--   DROP TABLE IF EXISTS internaute_cycle_vie_log, internaute_retention;
--   ALTER TABLE internaute DROP COLUMN IF EXISTS efface_a;   -- (destructif de la colonne : à n'exécuter que sciemment)
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/025_internaute_cycle_vie.sql
-- Vérification : \d internaute (colonne efface_a) ; SELECT * FROM internaute_retention ; \dt internaute_cycle_vie_log

BEGIN;

-- 1) Marqueur d'anonymisation en place (effacement). NULL = profil actif ; non-NULL = anonymisé (PII purgées) le jour dit.
ALTER TABLE internaute ADD COLUMN IF NOT EXISTS efface_a timestamptz;

-- 2) Durées de conservation PARAMÉTRABLES (jours), lues au runtime — jamais en dur. Patron `analytics_retention` (018).
CREATE TABLE IF NOT EXISTS internaute_retention (
  cle          text     PRIMARY KEY,
  jours        integer  NOT NULL CHECK (jours > 0),
  description  text
);
INSERT INTO internaute_retention (cle, jours, description) VALUES
  ('identite_projet_jours',     1095, 'Rétention identité (A) + projet (C) avant purge auto — PROVISOIRE, à fixer DPO.'),
  ('preuve_consentement_jours', 1825, 'Rétention de la PREUVE de consentement (B) — PROVISOIRE, à fixer DPO. NON purgée auto dans ce lot (défense en cas de contrôle).')
ON CONFLICT (cle) DO NOTHING;

-- 3) Journal append-only des opérations de cycle de vie (accountability). `utilisateur_id` = auteur admin (NULL =
--    voie de secours OU purge automatique). `cible_internaute_id` = personne concernée. `details` = jsonb (champs
--    rectifiés, motif, etc.) SANS PII (on ne recopie pas l'ancienne identité dans le journal).
CREATE TABLE IF NOT EXISTS internaute_cycle_vie_log (
  id                  bigserial   PRIMARY KEY,
  ts                  timestamptz NOT NULL DEFAULT now(),
  utilisateur_id      integer     REFERENCES admin_utilisateur(id),
  action              text        NOT NULL CHECK (action IN ('effacement', 'rectification', 'purge_auto')),
  cible_internaute_id uuid        NOT NULL,
  details             jsonb
);
CREATE INDEX IF NOT EXISTS internaute_cycle_vie_log_cible_idx ON internaute_cycle_vie_log (cible_internaute_id);
CREATE INDEX IF NOT EXISTS internaute_cycle_vie_log_ts_idx ON internaute_cycle_vie_log (ts);

COMMIT;
