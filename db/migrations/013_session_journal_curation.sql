-- 013_session_journal_curation.sql — Trace la SESSION de connexion dans le journal de curation.
--
-- ADDITIVE / IDEMPOTENTE / NON DESTRUCTIVE : ADD COLUMN IF NOT EXISTS, colonnes NULLABLES.
-- AUCUNE contrainte NOT NULL : les 243 lignes déjà présentes (antérieures au traçage) resteraient
-- en échec ; elles conservent volontairement NULL → l'UI affiche « session inconnue ». Aucune
-- rétro-attribution (l'auth est mono-utilisateur anonyme : un jti identifie une SESSION, pas une personne).
-- Aucun index pour l'instant (volume faible, pas de requête de regroupement à ce stade).
-- Golden-safe : le journal n'est JAMAIS lu par le moteur (faisceaux/verdict/pipeline de score).
-- Application MANUELLE (Arno) : psql "$DATABASE_URL" -f db/migrations/013_session_journal_curation.sql

-- Identifiant OPAQUE de la session (jti = UUID du JWS, posé à la connexion). NULL = entrée antérieure au traçage.
ALTER TABLE curation_patrimoine_log
  ADD COLUMN IF NOT EXISTS session_jti text;

-- Horodatage d'OUVERTURE de la session (= iat du jeton). Sert l'affichage humain « session du 8 juil., 14h02 »
-- sans exposer l'UUID brut. NULL = entrée antérieure au traçage (ou session illisible au moment de l'écriture).
ALTER TABLE curation_patrimoine_log
  ADD COLUMN IF NOT EXISTS session_ouverte_a timestamptz;
