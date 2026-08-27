-- 160_reglages_preparation_par_process.sql — D4-bis : les 2 réglages de PRÉPARATION per-commune (nb de dossiers par demande,
-- plafond mensuel de permis) deviennent surchargeables PAR RAIL, en modèle (a) SURCHARGE NULLABLE : NULL = suivre le réglage
-- COMMUN (byte-identique par construction), une valeur = surcharge le rail TÉLÉSERVICE. Le rail e-mail lit toujours la colonne
-- commune existante (`dossiers_par_demande`, `permis_par_commune_par_mois`) — INCHANGÉES.
--
--  · teleservice_dossiers_par_depot (créé en D4, jamais câblé) devient la SURCHARGE téléservice de `dossiers_par_demande` :
--      passe NULLABLE, DEFAULT retiré. ⚠️ Sa VALEUR ACTUELLE (1) est CONSERVÉE (non réécrite) — elle vaut la valeur commune
--      (dossiers_par_demande=1 en base) → comportement byte-identique. Le porteur peut la vider (NULL → suivre le commun) ou la
--      changer. Le CHECK 1..20 (159) reste (NULL le satisfait).
--  · teleservice_permis_par_commune_par_mois : NOUVELLE surcharge téléservice, NULLABLE, SANS default (NULL = suivre le commun).
--      CHECK 1..50.
--
-- 🔑 SÛR : DDL additive/idempotente, AUCUNE valeur réécrite (les colonnes communes et teleservice_dossiers_par_depot=1 restent
--    intactes), une transaction. Ne touche NI le moteur SVAV, NI le golden, NI la REQUÊTE candidats (la surcharge s'applique dans
--    `proposerLots`/`diagnostiquer`, APRÈS la requête, per-commune par canal → SQL candidats byte-identique). Lecture ISOLÉE
--    `lireTeleservice` (veilleConfig, motif lireCapsEnvoi) : tant que 160 non appliquée, ces surcharges retombent sur NULL (= commun).
--
-- Application MANUELLE (Arno), arrêt au 1er échec — TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE) :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/160_reglages_preparation_par_process.sql
-- DRY-RUN : remplacer « COMMIT; » par « ROLLBACK; ».

BEGIN;

-- teleservice_dossiers_par_depot → surcharge NULLABLE (NULL = suivre dossiers_par_demande). Valeur 1 conservée (= commun → byte-identique).
ALTER TABLE config_veille ALTER COLUMN teleservice_dossiers_par_depot DROP DEFAULT;
ALTER TABLE config_veille ALTER COLUMN teleservice_dossiers_par_depot DROP NOT NULL;

ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS teleservice_permis_par_commune_par_mois integer; -- NULLABLE, pas de DEFAULT → NULL = suivre le commun
DO $$ BEGIN
  ALTER TABLE config_veille ADD CONSTRAINT config_veille_teleservice_permis_chk CHECK (teleservice_permis_par_commune_par_mois BETWEEN 1 AND 50);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN config_veille.teleservice_dossiers_par_depot IS
  'D4-bis — SURCHARGE téléservice de dossiers_par_demande (nb de dossiers regroupés par dépôt manuel). NULL = suivre le réglage commun ; une valeur = surcharger le rail téléservice (surchargé en plus par mairie_contact.max_dossiers_par_demande si la commune a sa limite). Plage 1..20.';
COMMENT ON COLUMN config_veille.teleservice_permis_par_commune_par_mois IS
  'D4-bis — SURCHARGE téléservice de permis_par_commune_par_mois (plafond mensuel en permis). NULL = suivre le réglage commun ; une valeur = plafond propre au rail téléservice (le frein y est le temps du porteur, 2 communes, pas la saturation de la mairie). Plage 1..50.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (À LA MAIN) :
--   SELECT teleservice_dossiers_par_depot, teleservice_permis_par_commune_par_mois FROM config_veille WHERE id = 1;  -- attendu : 1 | NULL
