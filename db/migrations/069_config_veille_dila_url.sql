-- 069_config_veille_dila_url.sql — Module VEILLE PERMIS (chantier S30) : l'URL de l'annuaire DILA devient ÉDITABLE DEPUIS
-- L'ADMIN. En S28 elle vivait en variable d'environnement (DILA_URL) faute de migration autorisée ; ce n'était pas du
-- pilotage sans code (Arno, non-développeur, ne peut pas éditer une variable d'env). On la range dans `config_veille`
-- (singleton id=1, lu au runtime par `chargerConfigVeille`) : elle apparaît alors dans l'écran Réglages et devient éditable
-- sans toucher au code ni à l'environnement.
--
-- SÛR : DDL ADDITIVE uniquement (ADD COLUMN IF NOT EXISTS + ADD CONSTRAINT idempotent). Aucun DROP, aucune écriture ailleurs.
-- La ligne singleton existante reçoit la valeur par défaut (= le DEFAULT de S28, `DILA_URL_DEFAUT`). GOLDEN-SAFE (aucun
-- contact moteur/config_scoring/batiment → golden 29.107259068449615 intact). Idempotent. AUCUN ENVOI. Un seul BEGIN/COMMIT.
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/069_config_veille_dila_url.sql
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

-- Colonne : NOT NULL avec la valeur par défaut ACTUELLE (identique à DILA_URL_DEFAUT côté code). La ligne id=1 déjà présente
-- hérite du DEFAULT à l'ajout de la colonne (aucune ligne orpheline).
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS dila_url text NOT NULL
  DEFAULT 'https://www.data.gouv.fr/api/1/datasets/r/73302880-e4df-4d4c-8676-1a61bb997f3d';

-- CHECK de FORME MINIMAL : une adresse http(s):// sans espace. Miroir du garde applicatif `FORME_URL` (reglagesVeille.ts).
-- N'impose PAS un domaine précis (l'adresse officielle peut changer) — seulement qu'une URL valide soit saisie.
DO $$ BEGIN
  ALTER TABLE config_veille ADD CONSTRAINT config_veille_dila_url_check CHECK (dila_url ~* '^https?://[^[:space:]]+$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN config_veille.dila_url IS
  'S30 — URL de téléchargement de l''annuaire DILA (Base de données locales), éditable depuis l''écran Réglages (pilotage sans code). La BASE FAIT FOI : lue au runtime par chargerConfigVeille ; la variable d''env DILA_URL n''est plus qu''un secours si la base est injoignable. CHECK de forme http(s):// (config_veille_dila_url_check).';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--
--   -- (a) colonne présente, NOT NULL, valeur par défaut posée sur le singleton :
--   SELECT dila_url FROM config_veille WHERE id = 1;
--   \d config_veille
--
--   -- (b) le CHECK de forme est en place :
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'config_veille_dila_url_check';
--
--   -- (c) contrôle NÉGATIF (doit ÉCHOUER — forme invalide), en transaction annulée :
--   -- BEGIN; UPDATE config_veille SET dila_url = 'pas-une-url' WHERE id = 1; ROLLBACK;   -- doit violer le CHECK
