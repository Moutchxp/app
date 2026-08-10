-- 091_rattachement_reference_mairie.sql — Module VEILLE PERMIS (chantier R3f) : reconnaître la RÉFÉRENCE MAIRIE.
-- ⚠️ Une commune en canal FORMULAIRE (téléservice) n'a pas de dest_email → jamais interrogée par domaine ; sa réponse cite
-- SA propre référence (ex. « SLC260810440700 »), déjà enregistrée en P1 (demande_reference_externe). On ajoute une étape de
-- rattachement dédiée 'reference_mairie'. Cette migration ÉTEND la liste fermée des méthodes de rattachement. N'écrit JAMAIS
-- demande.statut. TU NE L'APPLIQUES PAS. Requiert 080.
--
-- SÛR : RECRÉATION de la SEULE contrainte CHECK des méthodes (DROP+ADD, même transaction : ÉLARGISSEMENT de la liste, jamais
-- un rétrécissement ; toutes les valeurs existantes restent valides). Aucun DROP de table/colonne/index, aucun UPDATE.
-- GOLDEN-SAFE. Un seul BEGIN/COMMIT. Idempotente (DROP IF EXISTS + ADD → même état à chaque exécution).
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/091_rattachement_reference_mairie.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer.
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

-- demande_reponse.rattachement_methode : ajout de 'reference_mairie' (rattachement par la référence propre de la mairie,
--   enregistrée en P1). RECRÉATION de la contrainte (élargissement de la liste fermée) — additif, données existantes OK.
ALTER TABLE demande_reponse DROP CONSTRAINT IF EXISTS demande_reponse_rattachement_methode_chk;
ALTER TABLE demande_reponse ADD CONSTRAINT demande_reponse_rattachement_methode_chk
  CHECK (rattachement_methode IN ('message_id','reference_objet','reference_corps','numero_dossier','reference_mairie','manuel','aucun'));

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'demande_reponse_rattachement_methode_chk';
--     -- doit lister : message_id, reference_objet, reference_corps, numero_dossier, reference_mairie, manuel, aucun
--
--   -- Contrôle POSITIF (doit RÉUSSIR), en transaction annulée :
--   -- BEGIN; UPDATE demande_reponse SET rattachement_methode = 'reference_mairie' WHERE false; ROLLBACK;  -- OK (valeur admise)
--   -- Contrôle NÉGATIF (doit ÉCHOUER), en transaction annulée :
--   -- BEGIN; UPDATE demande_reponse SET rattachement_methode = 'bidon' WHERE false; ROLLBACK;             -- viole la liste fermée
