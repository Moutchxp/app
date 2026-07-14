-- 029_internaute_projet_certificat.sql — Module INTERNAUTE : STATUT « CERTIFICAT » PAR ANALYSE (bloc C).
--
-- MOTIF : un internaute peut faire PLUSIEURS analyses ; certaines sans demander le certificat. On veut un statut
--   PAR ANALYSE (par ligne `internaute_projet`), distinct du statut PAR PERSONNE (`internaute.parcours`, migration 028).
--   `certificat_envoye = true` ⇔ l'internaute a VALIDÉ l'Écran B (« Recevoir mon certificat ») POUR CETTE analyse.
--   (L'envoi email réel viendra au LOT 6 ; ce booléen = « certificat demandé/validé » à ce stade.)
--
-- ⚠️ DISTINCT DU VERDICT ET DE `internaute.parcours` : `certificat_envoye` = statut CERTIFICAT par ANALYSE (bloc C).
--   `verdict` (SANS_VIS_A_VIS…) = résultat géométrique (bloc C). `internaute.parcours` = complétude PAR PERSONNE (bloc A).
--   Trois notions distinctes, ne jamais confondre.
--
-- PORTÉE : ALTER TABLE additif idempotent sur `internaute_projet` UNIQUEMENT. Aucune autre table, aucun DROP/DELETE.
--   Lignes EXISTANTES → défaut `false` (Écran B jamais validé pour elles → « (Certificat non envoyé) »). Le moteur
--   n'est ni rappelé ni modifié → golden 29.107259068449615 inchangé.
--
-- ROLLBACK (non destructif de données ; process validé uniquement) :
--   ALTER TABLE internaute_projet DROP COLUMN IF EXISTS certificat_envoye;   -- (à n'exécuter que sciemment)
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/029_internaute_projet_certificat.sql
-- Vérification : \d internaute_projet (colonne `certificat_envoye`) ;
--   SELECT certificat_envoye, count(*) FROM internaute_projet GROUP BY certificat_envoye;

BEGIN;

ALTER TABLE internaute_projet
  ADD COLUMN IF NOT EXISTS certificat_envoye boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN internaute_projet.certificat_envoye IS
  'Statut CERTIFICAT par ANALYSE : true ⇔ Écran B validé (« Recevoir mon certificat ») pour CETTE analyse. Distinct du verdict et de internaute.parcours (complétude par personne).';

COMMIT;
