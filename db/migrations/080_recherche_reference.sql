-- 080_recherche_reference.sql — Module VEILLE PERMIS (chantier R3e) : reconnaître le NUMÉRO DE DOSSIER SITADEL.
-- ⚠️ La relève ne voyait que les expéditeurs « domaine dest_email / mailer-daemon / postmaster ». On ajoute une recherche
-- serveur PAR RÉFÉRENCE DE PERMIS (le n° de dossier Sitadel, ~13 chiffres — la référence de LA MAIRIE, pas la nôtre), et
-- une étape de rattachement dédiée. Cette migration ajoute le plafond de recherche + étend la liste des méthodes de
-- rattachement. N'écrit JAMAIS demande.statut. TU NE L'APPLIQUES PAS. Requiert 079.
--
-- SÛR : ADD COLUMN additif + RECRÉATION de la CONTRAINTE CHECK des méthodes (DROP+ADD de la SEULE contrainte, dans la même
-- transaction : élargissement de la liste, jamais un rétrécissement ; les valeurs existantes restent toutes valides). Aucun
-- DROP de table/colonne/index. GOLDEN-SAFE. Un seul BEGIN/COMMIT. Idempotente.
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/080_recherche_reference.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer.
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) config_veille : borne du NOMBRE de références interrogées à chaque relève (éditable à l'écran). Sans elle, le nombre
--    de recherches serveur croîtrait indéfiniment avec le nombre de demandes.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS recherche_references_max integer NOT NULL DEFAULT 50
  CHECK (recherche_references_max BETWEEN 1 AND 500);

COMMENT ON COLUMN config_veille.recherche_references_max IS 'Nombre maximum de numéros de dossier interrogés côté serveur à chaque relève (les plus urgents/non satisfaits d''abord). Borne le coût de la recherche.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) demande_reponse.rattachement_methode : ajout de la méthode 'numero_dossier' (rattachement par n° de dossier Sitadel).
--    RECRÉATION de la contrainte (élargissement de la liste fermée) — additif, réversible sans perte, données existantes OK.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE demande_reponse DROP CONSTRAINT IF EXISTS demande_reponse_rattachement_methode_chk;
ALTER TABLE demande_reponse ADD CONSTRAINT demande_reponse_rattachement_methode_chk
  CHECK (rattachement_methode IN ('message_id','reference_objet','reference_corps','numero_dossier','manuel','aucun'));

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--
--   SELECT recherche_references_max FROM config_veille WHERE id = 1;
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'demande_reponse_rattachement_methode_chk';
--     -- doit lister : message_id, reference_objet, reference_corps, numero_dossier, manuel, aucun
--
--   -- Contrôles NÉGATIFs (doivent ÉCHOUER), en transaction annulée :
--   -- BEGIN; UPDATE config_veille SET recherche_references_max = 0 WHERE id = 1; ROLLBACK;   -- viole le CHECK (min 1)
--   -- BEGIN; UPDATE config_veille SET recherche_references_max = 501 WHERE id = 1; ROLLBACK; -- viole le CHECK (max 500)
--   -- BEGIN; UPDATE demande_reponse SET rattachement_methode = 'bidon' WHERE false; ROLLBACK; -- viole la liste fermée
