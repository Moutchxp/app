-- 045_internaute_auth.sql — Module INTERNAUTE : SOCLE D'AUTHENTIFICATION (comptes clients self-service).
--
-- MOTIF : ouvrir un futur ESPACE CLIENT (freemium) exige d'authentifier un internaute — capacité ABSENTE aujourd'hui
-- (la table `internaute` est un socle RGPD anonyme : ni mot de passe, ni session). On pose ici DEUX tables :
--   1. `internaute_auth` — UN credential (hash argon2id) par internaute, clé = `internaute_id` (FK ON DELETE CASCADE).
--   2. `internaute_login_echec` — état OPÉRATIONNEL de throttle anti-force-brute, keyé par un HACHÉ de l'e-mail
--      (SHA-256, JAMAIS l'e-mail en clair — un e-mail est une donnée personnelle). SÉPARÉ du `login_echec` ADMIN
--      (021, pool analytique, sans-PII), qui reste INTOUCHÉ.
--
-- SÉPARATION STRICTE admin ↔ internaute : ces tables ne référencent JAMAIS `admin_utilisateur`. La session internaute
-- aura son propre secret (`INTERNAUTE_SESSION_SECRET`) et son propre cookie (`svv_client_session`), distincts de l'admin.
--
-- CE LOT NE crée NI compte, NI UI, NI consentement : seulement la CAPACITÉ de stocker/vérifier un credential et l'état
-- de throttle. Le FLUX de création de compte depuis le tunnel est un lot SÉPARÉ.
--
-- SÛR : DDL uniquement, AUCUNE écriture de données, AUCUN DROP de table/colonne. Idempotent (IF NOT EXISTS).
-- GOLDEN-SAFE : aucun contact moteur / config_scoring → golden 29.107259068449615 inchangé.
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/045_internaute_auth.sql
-- Vérification : \dt internaute_auth ; \dt internaute_login_echec
-- ⚠️ AVANT USAGE : définir `INTERNAUTE_SESSION_SECRET` dans .env (secret aléatoire ≥ 32 octets, DISTINCT d'ADMIN_SESSION_SECRET
--    ET d'INTERNAUTE_TOKEN_SECRET). Sans lui, la signature de session throw (fail-closed).

BEGIN;

-- UN credential par internaute. Clé = internaute_id (jamais l'e-mail). ON DELETE CASCADE = filet défensif : la ligne
-- `internaute` n'est jamais SUPPRIMÉE (l'effacement RGPD ANONYMISE en place, cf. cycleVie), mais si elle l'était, le
-- credential partirait avec. `mot_de_passe` = hash argon2id encodé (JAMAIS le clair).
CREATE TABLE IF NOT EXISTS internaute_auth (
  internaute_id uuid        PRIMARY KEY REFERENCES internaute(id) ON DELETE CASCADE,
  mot_de_passe  text        NOT NULL,
  cree_a        timestamptz NOT NULL DEFAULT now(),
  maj_a         timestamptz NOT NULL DEFAULT now()
);

-- État de throttle anti-force-brute, SÉPARÉ de l'admin. `cle_hachee` = SHA-256 hex de lower(email) → JAMAIS l'e-mail
-- en clair. Une ligne par échec (comme l'admin). Éphémère : une purge périodique est à prévoir en lot ultérieur (la
-- lecture ne compte que la fenêtre récente ; les lignes anciennes sont inertes, seulement du volume).
CREATE TABLE IF NOT EXISTS internaute_login_echec (
  cle_hachee text        NOT NULL,
  ts         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS internaute_login_echec_cle_ts_idx ON internaute_login_echec (cle_hachee, ts);

COMMIT;
