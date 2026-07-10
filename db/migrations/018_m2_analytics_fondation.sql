-- 018_m2_analytics_fondation.sql — M2 (statistiques), LOT 1 : FONDATION du canal analytique.
--
-- MOTIF : créer les tables analytiques AUTONOMES du module M2 (voie A : agrégats à l'écriture, grain
-- JOUR). Ce lot ne collecte AUCUN événement et n'affiche AUCUNE statistique : il pose le schéma, que le
-- writer isolé (`app/lib/analytics/**`) et l'instrumentation (LOT 2) rempliront plus tard.
--
-- GARANTIES STRUCTURELLES (revue R1/R3 — vie privée) — le schéma rend IMPOSSIBLE de stocker :
--   * une IP (aucune colonne `inet`, aucune colonne d'IP hachée — `ip_hash` INTERDIT) ;
--   * une coordonnée / un cleabs / un identifiant de logement (aucune colonne `geometry`, aucune
--     colonne de coordonnée, aucune colonne `cleabs` ; la SEULE géo est `commune_insee`, bornée par
--     CHECK à 5 caractères de code INSEE — incapable de porter une lat/lon ou une adresse) ;
--   * une SECONDE au repos (AUCUNE colonne `timestamp`/`timestamptz`/`time` dans TOUTE la migration ;
--     le seul temps est `jour_paris date` — le jour civil parisien, jamais l'heure) ;
--   * un identifiant de personne (aucune colonne nominative ; `session_id` est un UUID éphémère jeté).
--
-- ÉVOLUTIVITÉ SANS MIGRATION : le nom d'événement est contraint par une CLÉ ÉTRANGÈRE vers la table de
-- config `analytics_catalogue_evenement` (et non un CHECK figé) : un nouveau type d'événement = un
-- INSERT dans le catalogue au runtime (pilotage sans code), sans migration ; une valeur INCONNUE reste
-- REJETÉE (violation de FK). Les autres enums (verdict, étape, device, raison) sont des listes fermées
-- stables → CHECK.
--
-- REJOUABLE / IDEMPOTENTE : `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, seed en
-- `ON CONFLICT DO NOTHING`, partitions créées `IF NOT EXISTS` dans un DO-block. Un rejeu DANS LE MÊME MOIS
-- = no-op. ⚠️ Un rejeu un mois ULTÉRIEUR recalcule les partitions du mois courant : si des lignes de ce
-- mois ont entre-temps atterri dans la partition DEFAULT, le CREATE de la partition nommée échouera
-- (contrainte de partition DEFAULT violée) — sans dommage (rollback), mais nécessitant l'évacuation
-- préalable de DEFAULT. Le roulement mensuel des partitions est du ressort du LOT 3 (pré-création avant
-- l'ouverture du mois) ; à l'état LOT 1, rien n'écrit `analytics_session` → DEFAULT reste vide → piège LATENT.
-- TRANSACTIONNELLE : tout est dans un seul BEGIN/COMMIT (échec au milieu → rollback complet).
-- ADDITIVE / NON DESTRUCTIVE : AUCUN DROP/TRUNCATE/DELETE, AUCUN ALTER, AUCUN TRIGGER sur une table
-- EXISTANTE (bdtopo_batiment, patrimoine_*, config_*, admin_*, mns/mnt_lidar_brut…). Zéro couplage au
-- moteur de calcul → golden hors de portée.
--
-- ROLLBACK (non destructif) : ces tables sont strictement nouvelles et isolées ; aucune donnée existante
-- n'est touchée. Revenir en arrière = DROP à la main, DANS L'ORDRE des dépendances FK (les compteurs
-- référencent le catalogue) :
--   DROP TABLE IF EXISTS analytics_compteur_jour, analytics_admin_jour, analytics_session,
--                        analytics_catalogue_evenement, analytics_retention;   -- (ou … CASCADE)
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/018_m2_analytics_fondation.sql
-- Vérification après application : `\dt analytics_*` → 5 tables de BASE + 4 partitions de
--   `analytics_session` (…_2026_07/_08/_09 + …_default) = 9 relations ; `\d+ analytics_session`
--   (partitionnée) ; `SELECT count(*) FROM analytics_catalogue_evenement;` (>= 13) ;
--   `SELECT * FROM analytics_retention;`.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Config (runtime-éditable — « pilotage sans code »)
-- ─────────────────────────────────────────────────────────────────────────────

-- Catalogue des noms d'événements autorisés (extensible au runtime → évolutivité sans migration).
CREATE TABLE IF NOT EXISTS analytics_catalogue_evenement (
  nom          text PRIMARY KEY,
  portee       text NOT NULL CHECK (portee IN ('public', 'interne')),
  actif        boolean NOT NULL DEFAULT true,
  description  text
);

-- Durées de rétention par type de donnée (en JOURS). Variables de comportement → éditables au runtime
-- (jamais en dur dans le code). Consommées par le job de purge (LOT 3), jamais dans le hot path.
CREATE TABLE IF NOT EXISTS analytics_retention (
  cle          text PRIMARY KEY,
  jours        integer NOT NULL CHECK (jours > 0),
  description  text
);

-- Seed du catalogue (public = tunnel ; interne = audit sécurité agrégé). ON CONFLICT → idempotent.
INSERT INTO analytics_catalogue_evenement (nom, portee, description) VALUES
  ('session_debut',        'public',  'Début d''une visite (après exécution JS, filtre bots)'),
  ('etape_atteinte',       'public',  'Entrée sur un écran du tunnel'),
  ('adresse_saisie',       'public',  'Adresse validée (jamais l''adresse elle-même)'),
  ('point_origine_place',  'public',  'Point d''origine validé (commune dérivée, jamais la position exacte)'),
  ('point_origine_refuse', 'public',  'Validation du point bloquée (avec raison)'),
  ('photo_prise',          'public',  'Photo capturée / validée (jamais la photo ni le GPS)'),
  ('analyse_lancee',       'public',  'Lancement du calcul'),
  ('resultat',             'public',  'Verdict rendu (verdict + tranche de score + commune)'),
  ('clic_certificat',      'public',  'Clic « obtenir le certificat »'),
  ('clic_estimation',      'public',  'Clic « estimer la valeur »'),
  ('session_fin',          'public',  'Clôture de session (synthétisée à la compaction)'),
  ('admin_connexion',      'interne', 'Connexion réussie d''un compte admin (audit agrégé)'),
  ('admin_connexion_echec','interne', 'Échec de connexion (détection brute-force, audit agrégé)')
ON CONFLICT (nom) DO NOTHING;

-- Seed des rétentions (valeurs de DÉPART — À CONFIRMER PAR UN DPO, cf. SPEC_M2_rgpd §Récapitulatif).
INSERT INTO analytics_retention (cle, jours, description) VALUES
  ('session_ephemere_jours', 2,   'TTL de sécurité des sessions éphémères (compactées au jour, purge filet)'),
  ('compteur_public_jours',  400, 'Rétention des agrégats publics k-safe — À CONFIRMER PAR DPO'),
  ('compteur_interne_jours', 400, 'Rétention des agrégats d''audit interne — À CONFIRMER PAR DPO')
ON CONFLICT (cle) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- Données publiques (pseudonymes, agrégées, grain jour)
-- ─────────────────────────────────────────────────────────────────────────────

-- Compteur jour PUBLIC : une ligne = (jour × nom × dimensions) → n. UPSERT à l'écriture.
-- `UNIQUE NULLS NOT DISTINCT` (PG15+) : les dimensions NULL se REGROUPENT (deux événements aux mêmes
-- dimensions non nulles s'agrègent), ce qu'un UNIQUE classique ne ferait pas (NULL y est distinct).
-- Plancher texte STRICT (charset allowlist) : bannit @, espace, '=', etc. → aucune PII évidente (email,
-- requête) ne peut se glisser dans source/medium/campagne, même avant l'allowlist fine du LOT 2 (F2).
CREATE TABLE IF NOT EXISTS analytics_compteur_jour (
  jour_paris          date    NOT NULL,
  nom                 text    NOT NULL REFERENCES analytics_catalogue_evenement(nom),
  -- Groupe GÉO/RÉSULTAT --------------------------------------------------------------------------------
  verdict             text    CHECK (verdict IN ('SANS_VIS_A_VIS', 'VIS_A_VIS', 'INDETERMINE')),
  score_tranche       smallint CHECK (score_tranche BETWEEN 1 AND 4),
  -- SEULE géo : code commune INSEE (5 car : 2 chiffres dept ou 2A/2B Corse, + 3). Incapable de porter
  -- une coordonnée ou une adresse.
  commune_insee       text    CHECK (commune_insee IS NULL OR commune_insee ~ '^(2[AB]|[0-9]{2})[0-9]{3}$'),
  -- Groupe ACQUISITION ---------------------------------------------------------------------------------
  source              text    CHECK (source IS NULL OR source ~ '^[A-Za-z0-9._-]{1,64}$'),
  medium              text    CHECK (medium IS NULL OR medium ~ '^[A-Za-z0-9._-]{1,64}$'),
  campagne            text    CHECK (campagne IS NULL OR campagne ~ '^[A-Za-z0-9._-]{1,64}$'),
  -- Hôte seul (pas d'URL : ni chemin, ni requête → pas de PII smuggling), ≤ 253 car (limite DNS).
  referer_hote        text    CHECK (referer_hote IS NULL OR (char_length(referer_hote) <= 253 AND referer_hote !~ '[/?#[:space:][:cntrl:]]')),
  device_type         text    CHECK (device_type IN ('mobile', 'desktop', 'tablette', 'inconnu')),
  navigateur_famille  text    CHECK (navigateur_famille IS NULL OR navigateur_famille ~ '^[A-Za-z0-9 ._-]{1,32}$'),
  -- Groupe NEUTRE (parcours, non ré-identifiant) -------------------------------------------------------
  etape               text    CHECK (etape IN ('intro', 'localisation', 'photo', 'axe', 'infos_logement', 'analyse', 'resultat')),
  raison              text    CHECK (raison IN ('hors_emprise', 'non_deplace', 'hors_lidar')),
  n                   bigint  NOT NULL DEFAULT 0 CHECK (n >= 0),
  -- ANTI-FINGERPRINT STRUCTUREL (F1) : une ligne NE PEUT PAS combiner le groupe ACQUISITION (device /
  -- navigateur / referer / utm) avec le groupe GÉO/RÉSULTAT (verdict / score / commune). Impossible, donc,
  -- de stocker « appareil+provenance à telle commune avec tel verdict » = quasi-empreinte d'un foyer.
  CONSTRAINT analytics_compteur_jour_pas_de_fingerprint CHECK (
    NOT (
      (source IS NOT NULL OR medium IS NOT NULL OR campagne IS NOT NULL OR referer_hote IS NOT NULL
        OR device_type IS NOT NULL OR navigateur_famille IS NOT NULL)
      AND
      (verdict IS NOT NULL OR score_tranche IS NOT NULL OR commune_insee IS NOT NULL)
    )
  ),
  CONSTRAINT analytics_compteur_jour_dims_uniq
    UNIQUE NULLS NOT DISTINCT (jour_paris, nom, verdict, score_tranche, source, medium, campagne,
                              referer_hote, device_type, navigateur_famille, commune_insee, etape, raison)
);
CREATE INDEX IF NOT EXISTS analytics_compteur_jour_jour_idx ON analytics_compteur_jour (jour_paris);
CREATE INDEX IF NOT EXISTS analytics_compteur_jour_nom_jour_idx ON analytics_compteur_jour (nom, jour_paris);

-- Session PUBLIQUE ÉPHÉMÈRE : état d'une visite en cours (parcours du tunnel = ACQUISITION UNIQUEMENT).
-- AUCUN timestamp (pas de seconde au repos) : le seul temps est `jour_paris`. AUCUNE géo (pas de
-- commune) ni verdict/score : la session ne porte que la provenance + l'étape max → jamais une empreinte
-- appareil×localisation (F1). `session_id` = UUID **v4 aléatoire** imposé par CHECK (un UUID v1/v6/v7
-- encode un timestamp → seconde au repos déguisée : REJETÉ, F3). Compactée en compteurs puis SUPPRIMÉE
-- (LOT 3) dès le jour scellé. Partitionnée par mois (EARS-V3) → purge par DROP de partition. La clé
-- d'unicité DOIT inclure la clé de partition (`jour_paris`) → PK (session_id, jour_paris).
CREATE TABLE IF NOT EXISTS analytics_session (
  session_id          uuid    NOT NULL,
  jour_paris          date    NOT NULL,
  etape_max           text    CHECK (etape_max IN ('intro', 'localisation', 'photo', 'axe', 'infos_logement', 'analyse', 'resultat')),
  source              text    CHECK (source IS NULL OR source ~ '^[A-Za-z0-9._-]{1,64}$'),
  medium              text    CHECK (medium IS NULL OR medium ~ '^[A-Za-z0-9._-]{1,64}$'),
  campagne            text    CHECK (campagne IS NULL OR campagne ~ '^[A-Za-z0-9._-]{1,64}$'),
  referer_hote        text    CHECK (referer_hote IS NULL OR (char_length(referer_hote) <= 253 AND referer_hote !~ '[/?#[:space:][:cntrl:]]')),
  device_type         text    CHECK (device_type IN ('mobile', 'desktop', 'tablette', 'inconnu')),
  navigateur_famille  text    CHECK (navigateur_famille IS NULL OR navigateur_famille ~ '^[A-Za-z0-9 ._-]{1,32}$'),
  complete            boolean NOT NULL DEFAULT false,
  -- UUID v4 STRICT (13ᵉ hex = 4, variante 8/9/a/b) → interdit tout UUID horodaté (v1/v6/v7).
  CONSTRAINT analytics_session_uuid_v4 CHECK (
    session_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT analytics_session_pk PRIMARY KEY (session_id, jour_paris)
) PARTITION BY RANGE (jour_paris);
CREATE INDEX IF NOT EXISTS analytics_session_jour_idx ON analytics_session (jour_paris);

-- ─────────────────────────────────────────────────────────────────────────────
-- Données internes (audit sécurité AGRÉGÉ — Q3 : pas de profilage individuel, pas de géoloc IP)
-- ─────────────────────────────────────────────────────────────────────────────

-- Compteur jour INTERNE : (jour × nom × module) → n. AUCUN utilisateur_id, AUCUNE IP, AUCUNE géo :
-- c'est un audit de SÉCURITÉ AGRÉGÉ (« combien de connexions/échecs par jour/module »), pas un suivi
-- individuel. Le « qui a fait quoi » individuel reste dans les journaux d'écriture existants
-- (curation_patrimoine_log, admin_utilisateur_log) pour l'investigation d'incident. Le suivi
-- individuel nominatif (périmètre 2) serait une décision d'Arno + information préalable → une autre
-- table, un autre lot. Ici : PAS de colonne « au cas où ».
CREATE TABLE IF NOT EXISTS analytics_admin_jour (
  jour_paris  date    NOT NULL,
  nom         text    NOT NULL REFERENCES analytics_catalogue_evenement(nom),
  module      text    CHECK (module IS NULL OR module ~ '^[a-z0-9_-]{1,32}$'),
  n           bigint  NOT NULL DEFAULT 0 CHECK (n >= 0),
  CONSTRAINT analytics_admin_jour_dims_uniq
    UNIQUE NULLS NOT DISTINCT (jour_paris, nom, module)
);
CREATE INDEX IF NOT EXISTS analytics_admin_jour_jour_idx ON analytics_admin_jour (jour_paris);

-- ─────────────────────────────────────────────────────────────────────────────
-- Partitions initiales de analytics_session (mois courant + 2 suivants) + DEFAULT (filet).
-- Idempotent (IF NOT EXISTS). Le LOT 3 (compaction/purge) prendra la relève du roulement mensuel.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  d    date := date_trunc('month', (now() AT TIME ZONE 'Europe/Paris'))::date;
  i    int;
  deb  date;
  fin  date;
  part text;
BEGIN
  FOR i IN 0..2 LOOP
    deb  := (d + (i || ' month')::interval)::date;
    fin  := (d + ((i + 1) || ' month')::interval)::date;
    part := 'analytics_session_' || to_char(deb, 'YYYY_MM');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF analytics_session FOR VALUES FROM (%L) TO (%L)',
      part, deb, fin);
  END LOOP;
  -- Filet : toute session dont le mois n'a pas (encore) de partition atterrit ici (jamais d'échec
  -- d'insert pour partition manquante). Les rares lignes DEFAULT sont purgées par TTL au LOT 3.
  EXECUTE 'CREATE TABLE IF NOT EXISTS analytics_session_default PARTITION OF analytics_session DEFAULT';
END $$;

COMMIT;
