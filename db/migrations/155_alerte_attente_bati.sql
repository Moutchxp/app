-- 155_alerte_attente_bati.sql — ATT-BATI (alerte) : prévenir l'exploitant quand un permis attend le bâti depuis trop longtemps.
--
-- CONTEXTE : RATT-AUTO (154) ferme la boucle le jour où une édition BD TOPO livrera le bâti attendu. Mais tant que ça n'arrive
-- pas (calendrier IGN de 1 à 3 ans), rien ne signale qu'un dossier attend, ni depuis quand — et si RATT-AUTO reste OFF ou tombe,
-- aucun signal. Cette alerte est le FILET : un simple rappel, JAMAIS une détection de bâti neuf.
--
-- CE LOT AJOUTE TROIS OBJETS, strictement ADDITIFS :
-- ① config_veille.attente_bati_alerte_active (boolean, DEFAULT false) — INTERRUPTEUR (opt-in, comme relance_auto_active /
--    alerte_active / rattachement_suivi_auto_active). Appliquer la migration ne DÉCLENCHE rien ; l'exploitant l'active d'un clic.
--    Pas de CHECK (un booléen n'a pas de plage).
-- ② config_veille.attente_bati_alerte_jours (int, DEFAULT 365, CHECK 30..1095) — SEUIL en jours au-delà duquel un dossier
--    « en attente de bâti » déclenche le rappel. DÉFAUT 365 (1 an) : le bâti neuf met 1 à 3 ans à apparaître ; en-deçà d'un an,
--    l'attente est NORMALE — un seuil de quelques semaines noierait l'exploitant sous des alertes qui ne signalent rien d'anormal.
--    Un an = seuil bas de la fenêtre IGN : un rappel annuel, léger, par dossier. Plage 30..1095 (1 mois à 3 ans) éditable au runtime.
-- ③ TABLE alerte_attente_bati — MARQUEUR anti-doublon : une ligne par dossier alerté (dossier_id PRIMARY KEY). Garantit UN SEUL
--    rappel par dossier et par franchissement de seuil (jamais un mail à chaque tick de l'ordonnanceur). Miroir de la table
--    d'idempotence alerte_ged. ON DELETE CASCADE sur sitadel_dossier (le marqueur suit le dossier).
--
-- 🔴 GARDE : ce lot ne touche NI suivreRattachement, NI RATT-AUTO, NI la détection du bâti, NI les états du rattachement, NI le
--    moteur de verdict SVAV, NI une altitude, NI un certificat, NI l'emprise reconstituée. L'alerte lit UNIQUEMENT l'état et
--    l'ancienneté du dossier (permis_rattachement.etat / detecte_le). Aucune condition ajoutée à aucune validation.
--
-- SÛR : DDL strictement ADDITIVE (ADD COLUMN / CREATE TABLE / INDEX « IF NOT EXISTS », ADD CONSTRAINT idempotent). Aucun DROP,
-- aucun ALTER destructif, aucune écriture de données. GOLDEN-SAFE. Idempotente. Une seule transaction. AUCUN ENVOI. Requiert
-- config_veille (048), permis_rattachement (116) et sitadel_dossier (047). Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/155_alerte_attente_bati.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

-- ① INTERRUPTEUR (opt-in, défaut false).
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS attente_bati_alerte_active boolean NOT NULL DEFAULT false;

-- ② SEUIL en jours (défaut 365 ; plage 30..1095 lue au runtime depuis ce CHECK).
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS attente_bati_alerte_jours int NOT NULL DEFAULT 365;
DO $$ BEGIN
  ALTER TABLE config_veille ADD CONSTRAINT config_veille_attente_bati_alerte_jours_chk CHECK (attente_bati_alerte_jours BETWEEN 30 AND 1095);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN config_veille.attente_bati_alerte_active IS
  'ATT-BATI — envoyer un rappel e-mail quand un permis reste « en attente de bâti » au-delà du seuil ? Opt-in (défaut false). Un simple rappel, JAMAIS une détection de bâti neuf ; aucune action requise.';
COMMENT ON COLUMN config_veille.attente_bati_alerte_jours IS
  'ATT-BATI — ancienneté (jours) au-delà de laquelle un dossier « en attente de bâti » déclenche le rappel. Défaut 365 (1 an, seuil bas de la fenêtre IGN 1-3 ans). Plage 30..1095.';

-- ③ MARQUEUR anti-doublon — un rappel par dossier et par franchissement.
CREATE TABLE IF NOT EXISTS alerte_attente_bati (
  dossier_id     bigint PRIMARY KEY REFERENCES sitadel_dossier(id) ON DELETE CASCADE,
  alerte_le      timestamptz NOT NULL DEFAULT now(),
  jours_au_seuil int NOT NULL   -- ancienneté (jours) au moment du rappel, pour la trace
);

COMMENT ON TABLE alerte_attente_bati IS
  'ATT-BATI — idempotence : une ligne = ce dossier a reçu son rappel « en attente de bâti ». Empêche un second mail à chaque tick de l''ordonnanceur (un seul rappel par dossier et par franchissement de seuil).';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--   SELECT column_name, data_type, column_default FROM information_schema.columns
--     WHERE table_name='config_veille' AND column_name IN ('attente_bati_alerte_active','attente_bati_alerte_jours');
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='config_veille_attente_bati_alerte_jours_chk'; -- BETWEEN 30 AND 1095
--   SELECT to_regclass('public.alerte_attente_bati'); -- non NULL
