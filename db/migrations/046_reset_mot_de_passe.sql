-- 046_reset_mot_de_passe.sql — Module INTERNAUTE : jetons de RÉINITIALISATION de mot de passe (« mot de passe oublié »).
--
-- MOTIF : le lien de reset envoyé par e-mail doit être à USAGE UNIQUE et INVALIDÉ dès qu'un nouveau est demandé.
-- L'infra de jeton existante (`jetonRectification.ts`, JWS apatride HS256) est REJOUABLE tant qu'elle n'a pas expiré →
-- inadaptée telle quelle. On pose donc l'ÉTAT en base : une table qui ne conserve QUE l'EMPREINTE du secret (SHA-256,
-- JAMAIS le secret en clair — même principe que les mots de passe), sa fenêtre de validité (`expire_a`) et son éventuelle
-- consommation (`consomme_a`).
--
-- CLÉ / INDEX :
--   - PK = `jeton_hache` : l'empreinte SHA-256 (hex) est GLOBALEMENT UNIQUE (secret aléatoire 256 bits) ET la clé de
--     lookup à la vérification → clé primaire NATURELLE, index de recherche gratuit.
--   - index `internaute_id` : requis par la FK `ON DELETE CASCADE` (Postgres n'indexe pas les FK) et par l'invalidation
--     « un seul jeton actif ».
--   - index `expire_a` : nettoyage périodique des jetons périmés (lot ultérieur).
--
-- « UN SEUL JETON ACTIF PAR INTERNAUTE » : par INVALIDATION APPLICATIVE (couche données, dans une transaction), PAS par
--   contrainte unique. Un index unique PARTIEL ne peut pas référencer `now()` (le prédicat doit être IMMUABLE) → il ne
--   saurait exprimer « non expiré » ; `UNIQUE (internaute_id) WHERE consomme_a IS NULL` laisserait un jeton EXPIRÉ mais
--   non consommé bloquer une nouvelle demande. L'invalidation applicative traite uniformément expiré ET non consommé.
--
-- SÛR : DDL uniquement, AUCUNE écriture de données, AUCUN DROP de table/colonne. Idempotent (IF NOT EXISTS).
-- GOLDEN-SAFE : aucun contact moteur / config_scoring → golden 29.107259068449615 inchangé.
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/046_reset_mot_de_passe.sql
-- Vérification : \d internaute_reset_mot_de_passe

BEGIN;

-- UN credential de reset = UNE empreinte. `jeton_hache` = SHA-256 hex du secret aléatoire (jamais le secret). Clé =
-- l'empreinte (unique par entropie). `internaute_id` FK ON DELETE CASCADE (filet : la ligne `internaute` n'est jamais
-- SUPPRIMÉE — l'effacement RGPD anonymise en place et DELETE déjà `internaute_auth` —, mais si elle l'était, ses jetons
-- de reset partiraient avec).
CREATE TABLE IF NOT EXISTS internaute_reset_mot_de_passe (
  jeton_hache   text        PRIMARY KEY,                                       -- empreinte SHA-256 hex (jamais le secret)
  internaute_id uuid        NOT NULL REFERENCES internaute(id) ON DELETE CASCADE,
  cree_a        timestamptz NOT NULL DEFAULT now(),
  expire_a      timestamptz NOT NULL,                                          -- fin de validité (~1 h posée par la couche données)
  consomme_a    timestamptz                                                    -- NULL tant que non utilisé (usage unique)
);

-- FK cascade + invalidation « un seul jeton actif » (lookup par internaute).
CREATE INDEX IF NOT EXISTS internaute_reset_mot_de_passe_internaute_idx ON internaute_reset_mot_de_passe (internaute_id);
-- Purge périodique des périmés (lot ultérieur).
CREATE INDEX IF NOT EXISTS internaute_reset_mot_de_passe_expire_idx ON internaute_reset_mot_de_passe (expire_a);

COMMIT;
