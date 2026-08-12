-- 094_dossier_triage.sql — Module VEILLE PERMIS (chantier T1) : statuer un dossier ligne par ligne dans l'onglet Réponses.
-- Aujourd'hui un dossier n'a que deux axes : `actif` (rattaché) et `satisfait_le` (« reçu »). T1 ajoute le TRIAGE des dossiers
-- NON reçus, à sens juridique distinct :
--   - 'non_fourni'  : la mairie a été saisie mais n'a pas livré ce dossier → il RESTE DÛ (échéance, relance, CADA tacite
--                     inchangés). Simple marquage de triage.
--   - 'refus_mairie': refus EXPRÈS → 2e voie d'entrée CADA, immédiate (R. 343-1). Le délai court à compter de la NOTIFICATION
--                     du refus, pas du geste dans l'admin → colonne dédiée `refus_le` (date de notification, ANCRE juridique),
--                     distincte de `triage_le` (horodatage du geste, traçabilité seule).
-- « reçu » reste porté par satisfait_le ; « retiré » reste porté par actif=false (aucune valeur de triage). Requiert 053.
--
-- SÛR : ADD COLUMN strictement ADDITIF (3 colonnes NULLABLES, défaut NULL → aucune ligne existante changée) + CHECK (liste
-- fermée triage + cohérence triage/triage_le + cohérence refus_mairie/refus_le). Aucun DROP de table/colonne, aucun UPDATE.
-- N'écrit JAMAIS demande.statut. GOLDEN-SAFE. Un seul BEGIN/COMMIT. Idempotente (ADD COLUMN IF NOT EXISTS ; DROP CONSTRAINT
-- IF EXISTS + ADD). TU NE L'APPLIQUES PAS. Lignes de données modifiées : 0 (colonnes additives).
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/094_dossier_triage.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer.
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

ALTER TABLE demande_dossier ADD COLUMN IF NOT EXISTS triage    text;
ALTER TABLE demande_dossier ADD COLUMN IF NOT EXISTS triage_le  timestamptz;
ALTER TABLE demande_dossier ADD COLUMN IF NOT EXISTS refus_le   date;

-- Liste fermée (pilotage sans code : la valeur admise est ici, source unique). NULL = pas de triage (dû non trié, ou reçu
-- via satisfait_le, ou retiré via actif=false).
ALTER TABLE demande_dossier DROP CONSTRAINT IF EXISTS demande_dossier_triage_chk;
ALTER TABLE demande_dossier ADD CONSTRAINT demande_dossier_triage_chk
  CHECK (triage IS NULL OR triage IN ('non_fourni', 'refus_mairie'));

-- Cohérence : la trace horodatée du geste est renseignée EXACTEMENT quand un triage l'est.
ALTER TABLE demande_dossier DROP CONSTRAINT IF EXISTS demande_dossier_triage_le_chk;
ALTER TABLE demande_dossier ADD CONSTRAINT demande_dossier_triage_le_chk
  CHECK ((triage IS NULL) = (triage_le IS NULL));

-- Cohérence : la date de refus (ancre CADA) est renseignée SSI c'est un refus exprès.
ALTER TABLE demande_dossier DROP CONSTRAINT IF EXISTS demande_dossier_refus_le_chk;
ALTER TABLE demande_dossier ADD CONSTRAINT demande_dossier_refus_le_chk
  CHECK ((triage = 'refus_mairie' AND refus_le IS NOT NULL)
      OR (triage IS DISTINCT FROM 'refus_mairie' AND refus_le IS NULL));

COMMENT ON COLUMN demande_dossier.triage IS 'Triage d''un dossier NON reçu (liste fermée) : non_fourni = saisi mais non livré, reste dû ; refus_mairie = refus exprès, ouvre la CADA immédiatement. NULL = pas de triage. « reçu » = satisfait_le ; « retiré » = actif=false.';
COMMENT ON COLUMN demande_dossier.triage_le IS 'Horodatage du GESTE de triage dans l''admin (traçabilité seule). N''entre PAS dans l''ancre CADA.';
COMMENT ON COLUMN demande_dossier.refus_le IS 'Date de NOTIFICATION du refus exprès (R. 343-1). SEULE valeur qui ancre la fenêtre CADA du refus exprès. Pré-remplie depuis la réponse rattachée, modifiable, jamais future. NULL sauf triage=refus_mairie.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--
--   \d demande_dossier   -- colonnes triage (text), triage_le (timestamptz), refus_le (date) + 3 CHECK présentes
--   SELECT count(*) FILTER (WHERE triage IS NOT NULL) FROM demande_dossier;  -- 0 (aucune ligne triée à l'application)
--
--   -- Contrôles NÉGATIFs (doivent ÉCHOUER), en transaction annulée :
--   -- BEGIN; UPDATE demande_dossier SET triage='bidon'                          WHERE false; ROLLBACK; -- liste fermée
--   -- BEGIN; UPDATE demande_dossier SET triage='non_fourni', triage_le=NULL     WHERE false; ROLLBACK; -- cohérence triage_le
--   -- BEGIN; UPDATE demande_dossier SET triage='refus_mairie', triage_le=now()  WHERE false; ROLLBACK; -- refus_le manquant
