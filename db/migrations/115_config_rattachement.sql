-- 115_config_rattachement.sql — Module VEILLE PERMIS (chantier FUS-2) : SEUILS du moteur PUR de détection du rattachement d'un
-- permis à sa parcelle/ses polygones futurs. On externalise les trois seuils de décision dans `config_veille` (pilotage sans
-- code) — JAMAIS de constante de seuil dispersée dans le moteur.
-- ⚠️ ENCODAGE : trois colonnes ENTIÈRES pour coller au moteur de formulaire Réglages existant (type 'entier' + bornes CHECK) :
--   · rattachement_seuil_surface_pct  = seuil du critère SURFACE en POURCENT (défaut 80). Le moteur divise par 100 → ratio [0,1].
--   · rattachement_seuil_bordure_pct  = seuil du critère BORDURE en POURCENT (défaut 60).  idem → ratio [0,1].
--   · rattachement_marge_altitude_cm  = marge d'égalité d'altitude des corps en CENTIMÈTRES (défaut 10 = 0,10 m). ÷100 → mètres.
-- Le lecteur runtime (app/lib/permis/rattachementConfig.ts) reconvertit en unités-métier (ratio, mètres) et signale la PROVENANCE
-- (valeur en base vs repli sur défaut si cette migration n'est pas encore appliquée).
--
-- ⚠️ CE CHANTIER N'AJOUTE PAS ENCORE LE BLOC ÉDITABLE dans l'écran Réglages : les colonnes existent et sont LUES au runtime, mais
-- le thème « Rattachement des permis » (PARAMS_VEILLE + section ReglagesVue) est DÛ AVEC FUS-3 (page de décision), là où Arno verra
-- de vrais cas à arbitrer et voudra régler à la main (notamment la MARGE D'ALTITUDE, explicitement demandée éditable). En attendant,
-- le rejeu à blanc IMPRIME les trois seuils et leur provenance → on sait toujours avec quels seuils une décision serait prise.
--
-- SÛR : DDL strictement ADDITIVE (ADD COLUMN IF NOT EXISTS, CHECK inline → idempotent car la colonne existante fait sauter l'ADD).
-- Aucun DROP, aucun UPDATE, aucune colonne existante touchée. Ne touche NI le moteur de verdict SVAV NI le golden. Idempotente.
-- Un seul BEGIN/COMMIT. Requiert 048 (config_veille). Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/115_config_rattachement.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS.

BEGIN;

ALTER TABLE config_veille
  ADD COLUMN IF NOT EXISTS rattachement_seuil_surface_pct integer NOT NULL DEFAULT 80
    CHECK (rattachement_seuil_surface_pct >= 50 AND rattachement_seuil_surface_pct <= 100),
  ADD COLUMN IF NOT EXISTS rattachement_seuil_bordure_pct integer NOT NULL DEFAULT 60
    CHECK (rattachement_seuil_bordure_pct >= 0 AND rattachement_seuil_bordure_pct <= 100),
  ADD COLUMN IF NOT EXISTS rattachement_marge_altitude_cm integer NOT NULL DEFAULT 10
    CHECK (rattachement_marge_altitude_cm >= 0 AND rattachement_marge_altitude_cm <= 100);

COMMENT ON COLUMN config_veille.rattachement_seuil_surface_pct IS
  'FUS-2 : seuil du critère SURFACE (%). Part de l''empreinte recouverte par une parcelle candidate au-delà de laquelle la surface est concluante. Jamais une égalité (voies/trottoirs prélevés). Défaut 80. Lu au runtime ÷100 → ratio.';
COMMENT ON COLUMN config_veille.rattachement_seuil_bordure_pct IS
  'FUS-2 : seuil du critère BORDURE (%). Part minimale du périmètre de la parcelle candidate coïncidant (à tolérance de distance) avec le contour de l''empreinte. Défaut 60. Lu au runtime ÷100 → ratio.';
COMMENT ON COLUMN config_veille.rattachement_marge_altitude_cm IS
  'FUS-2 : marge d''égalité d''altitude des corps (cm). En deçà, deux corps sont réputés de même altitude → affectation corps→polygone indifférente (pas d''arbitrage). Défaut 10 (0,10 m). Lu au runtime ÷100 → mètres.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (S'EXÉCUTE quand tu lances le fichier — AFFICHE le résultat) :
\echo '>>> colonnes de seuils de rattachement (type / défaut) :'
SELECT column_name, data_type, column_default FROM information_schema.columns
 WHERE table_name = 'config_veille' AND column_name LIKE 'rattachement\_%' ORDER BY column_name;
\echo '>>> CHECK (plages de validation) :'
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid = 'config_veille'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%rattachement\_%' ORDER BY conname;
