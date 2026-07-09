-- 014_comptes_administrateurs.sql — M3 Lot 1/5 : schéma des comptes administrateurs.
--
-- ADDITIVE / IDEMPOTENTE / NON DESTRUCTIVE : CREATE TABLE/INDEX IF NOT EXISTS, ADD COLUMN IF NOT EXISTS.
-- AUCUN DROP, AUCUN UPDATE/DELETE de données, AUCUN NOT NULL rétroactif sur une colonne ajoutée à une table
-- déjà peuplée. Introduit de vrais comptes là où l'auth était mono-utilisateur anonyme (mot de passe partagé).
-- Ne crée AUCUN compte (le bootstrap du 1er administrateur est le Lot 2). Le hash de mot de passe n'est pas
-- choisi ici : `mot_de_passe` est un `text` (jamais de mot de passe en clair).
-- Golden-safe : aucune de ces tables n'est lue par le moteur (faisceaux/verdict/pipeline de score).
-- Application MANUELLE (Arno) : psql "$DATABASE_URL" -f db/migrations/014_comptes_administrateurs.sql

-- ===================== COMPTES =====================
-- Deux rôles : 'administrateur' (accès complet, permissions IMPLICITES non stockées/non modifiables) et
-- 'collaborateur' (accès à la carte, permissions EXPLICITES via les 6 drapeaux perm_*). Un compte se DÉSACTIVE
-- (actif=false) et ne se supprime JAMAIS : le journal de curation le référence (intégrité + auditabilité).
CREATE TABLE IF NOT EXISTS admin_utilisateur (
  id                   bigserial   PRIMARY KEY,
  identifiant          text        NOT NULL UNIQUE,   -- login ; unicité INSENSIBLE à la casse via l'index ci-dessous
  mot_de_passe         text        NOT NULL,          -- HASH (algorithme choisi au Lot 2) ; jamais en clair
  role                 text        NOT NULL CHECK (role IN ('administrateur','collaborateur')),
  actif                boolean     NOT NULL DEFAULT true,   -- désactivation = false (remplace la suppression)
  -- 6 permissions booléennes, une par module de la barre latérale. Ignorées pour un 'administrateur'
  -- (permissions implicites) ; pilotent l'accès d'un 'collaborateur'.
  perm_pilotage        boolean     NOT NULL DEFAULT false,
  perm_cartes_annee    boolean     NOT NULL DEFAULT false,
  perm_statistiques    boolean     NOT NULL DEFAULT false,
  perm_internautes     boolean     NOT NULL DEFAULT false,
  perm_curation        boolean     NOT NULL DEFAULT false,
  perm_banc_test       boolean     NOT NULL DEFAULT false,
  cree_a               timestamptz NOT NULL DEFAULT now(),
  derniere_connexion_a timestamptz                    -- NULL = jamais connecté ; mis à jour à la connexion (Lot 2+)
);

-- Unicité de l'identifiant INSENSIBLE à la casse (« Alice » == « alice »).
CREATE UNIQUE INDEX IF NOT EXISTS admin_utilisateur_identifiant_idx
  ON admin_utilisateur (lower(identifiant));

-- ===================== RATTACHEMENT DU JOURNAL DE CURATION =====================
-- Auteur d'une entrée du journal. NULLABLE : les entrées ANTÉRIEURES aux comptes (créées avant ce module)
-- restent à NULL = « utilisateur inconnu ». Aucune rétro-attribution, aucun NOT NULL (les lignes existantes
-- échoueraient). FK vers admin_utilisateur : un compte référencé ne peut donc pas être supprimé (d'où la
-- désactivation), ce qui préserve l'intégrité de l'audit.
ALTER TABLE curation_patrimoine_log
  ADD COLUMN IF NOT EXISTS utilisateur_id bigint REFERENCES admin_utilisateur(id);

CREATE INDEX IF NOT EXISTS curation_patrimoine_log_utilisateur_idx
  ON curation_patrimoine_log (utilisateur_id);

-- ===================== JOURNAL D'AUDIT DES COMPTES =====================
-- Append-only (même patron que curation_patrimoine_log) : trace chaque changement de compte. `cible_id` = le
-- compte modifié (obligatoire) ; `auteur_id` = qui a fait le changement (NULLABLE : bootstrap, ou auteur inconnu).
CREATE TABLE IF NOT EXISTS admin_utilisateur_log (
  id        bigserial   PRIMARY KEY,
  ts        timestamptz NOT NULL DEFAULT now(),
  action    text        NOT NULL CHECK (action IN
              ('creation','desactivation','reactivation','changement_role',
               'changement_permissions','reinitialisation_mot_de_passe')),
  cible_id  bigint      NOT NULL REFERENCES admin_utilisateur(id),
  auteur_id bigint      REFERENCES admin_utilisateur(id),
  avant     jsonb,
  apres     jsonb
);
