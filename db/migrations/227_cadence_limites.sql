-- 227 — LIMITATION DE CADENCE des routes publiques coûteuses (résidu G4 de l'audit du 2026-09-21).
--
-- PRINCIPE PRODUIT (arbitrage du porteur) : les titulaires de compte ont des analyses ILLIMITÉES EN TOTAL.
-- On ne limite QUE la CADENCE — un rythme qu'un humain ne peut pas tenir, une analyse prenant 1 à 2 minutes.
-- Aucun plafond journalier ni total pour un compte : seuls les visiteurs SANS compte en ont un.
--
-- ADDITIF STRICT : deux CREATE TABLE et une ligne de défauts. Aucun UPDATE ni DELETE sur des données existantes.
-- Idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING), comme les 226 migrations précédentes.

-- ── Seuils PILOTABLES SANS CODE (singleton id = 1, même convention que config_scoring / config_veille) ──
CREATE TABLE IF NOT EXISTS config_cadence (
  id                             integer PRIMARY KEY DEFAULT 1,
  -- Visiteur SANS compte, par adresse IP.
  visiteur_analyses_par_10min    integer NOT NULL DEFAULT 3,
  visiteur_analyses_par_24h      integer NOT NULL DEFAULT 10,
  -- Titulaire de compte, par compte. AUCUNE limite journalière ni totale — volontairement absente du modèle :
  -- ce qui n'existe pas en colonne ne peut pas être posé par erreur.
  compte_analyses_par_10min      integer NOT NULL DEFAULT 10,
  compte_analyses_par_heure      integer NOT NULL DEFAULT 40,
  -- Création de compte, par adresse IP.
  creation_compte_par_heure      integer NOT NULL DEFAULT 3,
  -- Interrupteur général : false = plus aucune limite (secours d'exploitation, sans redéploiement).
  actif                          boolean NOT NULL DEFAULT true,
  maj_a                          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT config_cadence_singleton CHECK (id = 1),
  -- Bornes de SÛRETÉ en base (le code valide aussi, mais la base reste la dernière barrière) : un 0 fermerait
  -- le service, une valeur absurde le laisserait ouvert.
  CONSTRAINT config_cadence_bornes CHECK (
    visiteur_analyses_par_10min BETWEEN 1 AND 1000
    AND visiteur_analyses_par_24h BETWEEN 1 AND 10000
    AND compte_analyses_par_10min BETWEEN 1 AND 1000
    AND compte_analyses_par_heure BETWEEN 1 AND 10000
    AND creation_compte_par_heure BETWEEN 1 AND 1000
  )
);

INSERT INTO config_cadence (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── Compteurs : UN ÉVÉNEMENT PAR LIGNE (fenêtre GLISSANTE exacte) ──
-- Choix assumé contre des seaux à fenêtre fixe : le volume est faible (une analyse prend 1 à 2 min, quelques
-- unités par minute au pic), et une fenêtre glissante exacte est plus simple à comprendre, à tester et à
-- expliquer à l'internaute (le « dans X minutes » rendu dans Retry-After est alors la vérité, pas une approximation).
-- Une fenêtre fixe laisserait en outre passer le double du seuil à cheval sur deux fenêtres.
CREATE TABLE IF NOT EXISTS cadence_evenement (
  id       bigserial PRIMARY KEY,
  -- Nature de l'action comptée ('analyse' | 'creation_compte').
  action   text NOT NULL,
  -- Portée du compteur : 'ip' (visiteur sans compte) ou 'compte' (titulaire). Jamais les deux à la fois.
  portee   text NOT NULL,
  -- Identifiant DANS cette portée : adresse IP, ou identifiant d'internaute. Jamais de coordonnée, jamais de nom.
  sujet    text NOT NULL,
  cree_a   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cadence_evenement_action CHECK (action IN ('analyse', 'creation_compte')),
  CONSTRAINT cadence_evenement_portee CHECK (portee IN ('ip', 'compte'))
);

-- Index de la SEULE requête de lecture : compter les événements d'un sujet depuis un instant donné.
CREATE INDEX IF NOT EXISTS cadence_evenement_fenetre_idx
  ON cadence_evenement (action, portee, sujet, cree_a DESC);
-- Index de la PURGE (balayage par date seule).
CREATE INDEX IF NOT EXISTS cadence_evenement_purge_idx ON cadence_evenement (cree_a);

COMMENT ON TABLE config_cadence IS
  'Seuils de cadence des routes publiques (singleton id=1). Pilotables sans redéploiement ; repli codé en dur si la table est absente.';
COMMENT ON TABLE cadence_evenement IS
  'Un événement compté par ligne (fenêtre glissante). Purgé au-delà de la plus longue fenêtre utile. Aucune donnée nominative.';
