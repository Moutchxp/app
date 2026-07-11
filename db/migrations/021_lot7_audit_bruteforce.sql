-- 021_lot7_audit_bruteforce.sql — M2 LOT 7 : détection brute-force (throttle progressif) + config d'audit.
--
-- MOTIF : la route de connexion admin (app/(admin)/api/admin/session/route.ts) ne journalise AUJOURD'HUI
-- ni les échecs ni une série de succès (seul `admin_utilisateur.derniere_connexion_a` est écrasé au succès).
-- Le LOT 7 crée donc (a) l'ÉTAT de détection du throttle et (b) branche les compteurs d'audit AGRÉGÉS déjà
-- provisionnés au LOT 1 (`analytics_admin_jour`, événements `admin_connexion` / `admin_connexion_echec` du
-- catalogue). L'écran d'audit ne lit QUE ces agrégats — jamais la table d'état ci-dessous.
--
-- PÉRIMÈTRE RGPD (SPEC_M2 Q-C=1) : audit AGRÉGÉ. AUCUNE IP nulle part. AUCUN profil individuel. La table
-- `login_echec` est un ÉTAT OPÉRATIONNEL ÉPHÉMÈRE (throttle) : un identifiant y est une CHAÎNE saisie
-- (existante ou non), jamais reliée à une personne dans une vue ; purgée par le cron de maintenance.
--
-- ADDITIVE / IDEMPOTENTE / NON DESTRUCTIVE : CREATE TABLE/INDEX IF NOT EXISTS, seed ON CONFLICT DO NOTHING.
-- Aucun DROP/ALTER/TRIGGER sur une table existante. TRANSACTIONNELLE (BEGIN/COMMIT).
-- Golden-safe : aucune table lue par le moteur (faisceaux/verdict/pipeline de score) → golden hors de portée.
--
-- Application MANUELLE (Arno), zsh, arrêt au 1er échec :
--   export DATABASE_URL="...(depuis .env)..."
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/021_lot7_audit_bruteforce.sql
-- Vérification : \d login_echec ; SELECT cle,valeur FROM analytics_config WHERE cle LIKE 'login_throttle%';
--   SELECT * FROM analytics_retention WHERE cle='login_echec_jours';
-- Rollback non destructif : DROP TABLE IF EXISTS login_echec;
--   DELETE FROM analytics_config WHERE cle LIKE 'login_throttle%'; DELETE FROM analytics_retention WHERE cle='login_echec_jours';

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- État OPÉRATIONNEL éphémère du throttle : un échec de connexion = une ligne (identifiant, ts).
--  - SANS IP, SANS géo, SANS identifiant de personne : `identifiant` est la CHAÎNE saisie au login
--    (compte existant OU inexistant OU '' pour la voie de secours). Le throttle s'applique à la chaîne,
--    ce qui NE révèle jamais l'existence d'un compte.
--  - JAMAIS un profil : la vue d'audit ne lit PAS cette table ; elle ne lit que `analytics_admin_jour`
--    (compteurs agrégés jour × événement, sans identifiant). Cette table sert UNIQUEMENT à calculer le
--    délai de throttle par identifiant, puis est purgée par le cron (rétention `login_echec_jours`).
--  - AUCUN timestamp de personne au repos : `ts` horodate une TENTATIVE (chaîne), pas une session humaine.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS login_echec (
  identifiant text        NOT NULL,
  ts          timestamptz NOT NULL DEFAULT now()
);
-- Comptage des échecs récents d'un identifiant (throttle) : WHERE identifiant = $1 AND ts > now()-W.
CREATE INDEX IF NOT EXISTS login_echec_id_ts_idx ON login_echec (identifiant, ts);
-- Purge par âge (cron) : WHERE ts < now()-rétention.
CREATE INDEX IF NOT EXISTS login_echec_ts_idx ON login_echec (ts);

-- ─────────────────────────────────────────────────────────────────────────────
-- Config du THROTTLE — éditable au runtime (« pilotage sans code »), jamais en dur dans le code.
-- Foyer : `analytics_config` (table clé→valeur des réglages d'ops runtime, déjà foyer de `bots_ua_motif`).
-- Le module de throttle lit ces clés avec un REPLI CODÉ sûr (fonctionne même si 021 n'est pas appliquée).
-- THROTTLE, PAS LOCKOUT : le délai croît puis PLAFONNE (`login_throttle_max_s`) — jamais de verrouillage dur.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO analytics_config (cle, valeur, description) VALUES
  ('login_throttle_seuil',     '5',
   'N : nombre d''échecs (par identifiant, dans la fenêtre) AVANT que le throttle ne s''applique. Sous N : aucun délai.'),
  ('login_throttle_fenetre_s', '900',
   'W (secondes) : fenêtre glissante de comptage des échecs (défaut 15 min). Au-delà, un échec n''est plus compté.'),
  ('login_throttle_base_s',    '2',
   'Délai de base (secondes) du backoff exponentiel : délai = base · 2^(échecs-N), plafonné à login_throttle_max_s.'),
  ('login_throttle_max_s',     '300',
   'Plafond du délai (secondes, défaut 5 min). Borne le backoff — garantit qu''il ne devient JAMAIS un lockout dur.'),
  ('audit_pic_min',            '20',
   'Détection de pic d''échecs (écran d''audit) : plancher ABSOLU d''échecs/jour sous lequel aucun pic n''est signalé.'),
  ('audit_pic_facteur',        '3',
   'Détection de pic : un jour est « anormal » si ses échecs ≥ max(audit_pic_min, médiane · audit_pic_facteur). Adaptatif.')
ON CONFLICT (cle) DO NOTHING;

-- Rétention de l'état de détection — cohérent avec les autres purges du cron (analytics_retention).
INSERT INTO analytics_retention (cle, jours, description) VALUES
  ('login_echec_jours', 1,
   'TTL (jours) de l''état de throttle `login_echec`. Court : au-delà de la fenêtre W un échec est inutile. Purge par le cron de maintenance (Lot 3). Jamais un profil.')
ON CONFLICT (cle) DO NOTHING;

COMMIT;
