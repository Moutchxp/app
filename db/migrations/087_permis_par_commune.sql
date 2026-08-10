-- 087_permis_par_commune.sql — Module VEILLE PERMIS (chantier Q1) : le plafond mensuel par commune se compte en PERMIS.
-- ⚠️ `demandes_par_commune_par_mois` comptait des DEMANDES (courriers). Depuis P3, une commune à téléservice (Paris, max=1)
-- transforme 1 demande en 1 dossier → son débit mensuel est tombé de 5 permis à 1, sans que le plafond n'ait changé : c'est
-- ce qu'il COMPTE qui était faux. On introduit `permis_par_commune_par_mois` (un nombre de PERMIS), qui remplace l'ancien.
-- L'ancien est CONSERVÉ (lu par de l'historique ; le retirer casserait des lignes existantes) et devient VESTIGIAL.
-- N'écrit JAMAIS demande.statut. TU NE L'APPLIQUES PAS. Requiert 086.
--
-- SÛR : ADD COLUMN additif + seed depuis les colonnes EN BASE (jamais un chiffre en dur) + CHECK nommé. Aucun DROP de table/
-- colonne. GOLDEN-SAFE. Un seul BEGIN/COMMIT. Idempotente.
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/087_permis_par_commune.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer.
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS permis_par_commune_par_mois integer;

-- VALEUR PAR DÉFAUT (reproduit EXACTEMENT le débit actuel) : calculée DEPUIS les colonnes réellement en base, pas en dur.
--   permis = demandes_par_commune_par_mois × dossiers_par_demande  (= 1 × 5 = 5 aujourd'hui).
UPDATE config_veille SET permis_par_commune_par_mois = demandes_par_commune_par_mois * dossiers_par_demande
  WHERE permis_par_commune_par_mois IS NULL;

-- Défaut de colonne = produit des DÉFAUTS des deux colonnes (053 : demandes 1 × dossiers 5 = 5). Borne haute = produit de
-- leurs MAX (dossiers 1..20 × demandes 1..10 = 1..200) → un BETWEEN parseable par `parserBornesCheck` (l'UI éditable en a
-- besoin ; un « > 0 » seul ne donnerait aucune plage). Le BETWEEN 1 AND 200 satisfait « > 0 » (min 1).
ALTER TABLE config_veille ALTER COLUMN permis_par_commune_par_mois SET DEFAULT 5;
ALTER TABLE config_veille ALTER COLUMN permis_par_commune_par_mois SET NOT NULL;
ALTER TABLE config_veille DROP CONSTRAINT IF EXISTS config_veille_permis_par_commune_chk;
ALTER TABLE config_veille ADD CONSTRAINT config_veille_permis_par_commune_chk CHECK (permis_par_commune_par_mois BETWEEN 1 AND 200);

COMMENT ON COLUMN config_veille.permis_par_commune_par_mois IS 'Nombre maximum de PERMIS (dossiers) demandés à une même commune par mois, quel que soit le nombre de courriers/dépôts que cela représente. Remplace demandes_par_commune_par_mois (qui comptait des demandes, faussé par les communes à un ticket par dossier). Défaut = ancien × dossiers_par_demande.';
COMMENT ON COLUMN config_veille.demandes_par_commune_par_mois IS 'VESTIGIAL depuis Q1 : n''agit plus (remplacé par permis_par_commune_par_mois). CONSERVÉ (jamais supprimé) — encore lu par de l''historique ; non éditable à l''écran.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--
--   SELECT demandes_par_commune_par_mois, dossiers_par_demande, permis_par_commune_par_mois FROM config_veille WHERE id = 1;
--     -- permis doit valoir demandes × dossiers (= 5 aujourd'hui).
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'config_veille_permis_par_commune_chk';
--     -- CHECK (((permis_par_commune_par_mois >= 1) AND (permis_par_commune_par_mois <= 200)))
--
--   -- Contrôles NÉGATIFs (doivent ÉCHOUER), en transaction annulée :
--   -- BEGIN; UPDATE config_veille SET permis_par_commune_par_mois = 0 WHERE id = 1; ROLLBACK;   -- viole le CHECK (min 1)
--   -- BEGIN; UPDATE config_veille SET permis_par_commune_par_mois = 201 WHERE id = 1; ROLLBACK; -- viole le CHECK (max 200)
