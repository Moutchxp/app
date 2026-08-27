-- 161_reglages_preparation_etanches.sql — D4-ter (modèle ÉTANCHE) : les 3 réglages de préparation qui diffèrent par rail ont
-- désormais une valeur PROPRE à chaque process, sans influence croisée (fin du « NULL = suit le commun » de D4-bis).
--   · dossiers_par_demande / permis_par_commune_par_mois / profil_demandeur_defaut : CONSERVÉES telles quelles — elles DEVIENNENT
--     la valeur du rail E-MAIL (rien à écrire).
--   · teleservice_dossiers_par_depot : COALESCE(valeur, dossiers_par_demande) puis NOT NULL. CHECK 1..20 conservé (159).
--   · teleservice_permis_par_commune_par_mois : COALESCE(valeur, permis_par_commune_par_mois) puis NOT NULL. CHECK 1..50 conservé (160).
--   · teleservice_profil_demandeur_defaut : NOUVELLE colonne, = profil_demandeur_defaut (donc 'entreprise' aujourd'hui), NOT NULL,
--     CHECK IN ('entreprise','personne'). ⚠️ Livrée à la valeur COMMUNE — c'est le porteur qui la passera à 'personne' (règle FranceConnect).
--
-- 🔑 SÛR : init par COALESCE ⇒ comportement STRICTEMENT INCHANGÉ le jour de l'application (chaque valeur de rail vaut ce que le
--    commun valait). AUCUNE colonne supprimée. Ne touche NI le moteur SVAV, NI le golden, NI la REQUÊTE candidats (les 3 réglages
--    sont appliqués APRÈS la requête, per-commune par canal). Lecture ISOLÉE `lireTeleservice` (veilleConfig) : tant que 161 non
--    appliquée, teleservice_profil_demandeur_defaut est ABSENTE → repli sur le profil commun ('entreprise') → comportement identique.
--
-- Application MANUELLE (Arno), arrêt au 1er échec — TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE) :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/161_reglages_preparation_etanches.sql
-- DRY-RUN : remplacer « COMMIT; » par « ROLLBACK; ».

BEGIN;

-- teleservice_dossiers_par_depot : la valeur de rail téléservice devient à part entière (init au commun si NULL), puis NOT NULL.
UPDATE config_veille SET teleservice_dossiers_par_depot = COALESCE(teleservice_dossiers_par_depot, dossiers_par_demande) WHERE id = 1;
ALTER TABLE config_veille ALTER COLUMN teleservice_dossiers_par_depot SET NOT NULL;

-- teleservice_permis_par_commune_par_mois : idem (aujourd'hui NULL → prendra la valeur commune).
UPDATE config_veille SET teleservice_permis_par_commune_par_mois = COALESCE(teleservice_permis_par_commune_par_mois, permis_par_commune_par_mois) WHERE id = 1;
ALTER TABLE config_veille ALTER COLUMN teleservice_permis_par_commune_par_mois SET NOT NULL;

-- teleservice_profil_demandeur_defaut : NOUVELLE colonne du rail téléservice (absorbe le lot P), init au profil commun.
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS teleservice_profil_demandeur_defaut text;
UPDATE config_veille SET teleservice_profil_demandeur_defaut = COALESCE(teleservice_profil_demandeur_defaut, profil_demandeur_defaut) WHERE id = 1;
ALTER TABLE config_veille ALTER COLUMN teleservice_profil_demandeur_defaut SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE config_veille ADD CONSTRAINT config_veille_teleservice_profil_chk CHECK (teleservice_profil_demandeur_defaut IN ('entreprise', 'personne'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN config_veille.teleservice_dossiers_par_depot IS
  'D4-ter (étanche) — nombre de dossiers par demande PROPRE au rail téléservice (dépôt manuel). Valeur à part entière (plus de « suit le commun »). Plage 1..20.';
COMMENT ON COLUMN config_veille.teleservice_permis_par_commune_par_mois IS
  'D4-ter (étanche) — plafond mensuel de permis par commune PROPRE au rail téléservice. Valeur à part entière. Plage 1..50.';
COMMENT ON COLUMN config_veille.teleservice_profil_demandeur_defaut IS
  'D4-ter (étanche, absorbe P) — profil de demandeur par défaut PROPRE au rail téléservice (entreprise/personne). Prévu pour « personne physique » (FranceConnect), livré à la valeur commune.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (À LA MAIN) :
--   SELECT teleservice_dossiers_par_depot, teleservice_permis_par_commune_par_mois, teleservice_profil_demandeur_defaut,
--          dossiers_par_demande, permis_par_commune_par_mois, profil_demandeur_defaut FROM config_veille WHERE id = 1;
--   -- attendu (jour J) : chaque colonne téléservice = sa colonne commune correspondante.
