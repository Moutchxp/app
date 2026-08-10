-- 086_commune_contrainte_teleservice.sql — Module VEILLE PERMIS (chantier P3) : CONTRAINTES de téléservice par commune.
-- ⚠️ Certaines communes imposent, PAR LEUR TÉLÉSERVICE (pas par préférence), (1) UN SEUL numéro de dossier par demande —
-- champ mono-valeur, aucun dépôt groupé possible (ex. Paris : sollicitations.paris.fr) ; (2) l'identité CIVILE du déposant
-- via FranceConnect → le profil « société » y est inutilisable. On ouvre DEUX colonnes sur `mairie_contact`, toutes deux
-- NULLABLE (NULL = comportement ACTUEL inchangé). AUCUNE valeur posée ici : Paris sera renseigné à l'écran ou par un seed
-- séparé, décidé plus tard. Cette migration ne fait qu'OUVRIR la possibilité. N'écrit JAMAIS demande.statut. Requiert 085.
--
-- SÛR : ADD COLUMN IF NOT EXISTS additif (deux colonnes nullable + CHECK nommés). Aucun DROP, aucune valeur, aucune ALTER
-- d'une autre table. GOLDEN-SAFE. Un seul BEGIN/COMMIT. Idempotente.
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/086_commune_contrainte_teleservice.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer.
-- Vérification : voir le bloc en fin de fichier.

BEGIN;

-- (1) Nombre MAXIMUM de dossiers regroupables dans une demande pour cette commune. NULL = pas de limite propre (défaut
--     global `config_veille.dossiers_par_demande`). Paris = 1 (téléservice mono-dossier).
ALTER TABLE mairie_contact
  ADD COLUMN IF NOT EXISTS max_dossiers_par_demande integer
    CONSTRAINT mairie_contact_max_dossiers_chk CHECK (max_dossiers_par_demande > 0);

-- (2) Profil de demandeur OBLIGATOIRE pour cette commune. NULL = libre (profil choisi ailleurs). Paris = 'personne'
--     (FranceConnect impose l'identité civile ; annoncer une société contredirait le récapitulatif du formulaire).
ALTER TABLE mairie_contact
  ADD COLUMN IF NOT EXISTS profil_demandeur_impose text
    CONSTRAINT mairie_contact_profil_impose_chk CHECK (profil_demandeur_impose IN ('entreprise','personne'));

COMMENT ON COLUMN mairie_contact.max_dossiers_par_demande IS 'Contrainte du TÉLÉSERVICE (pas une préférence) : nombre max de dossiers par demande pour cette commune. NULL = limite globale. Paris = 1 (un seul n° de dossier par dépôt).';
COMMENT ON COLUMN mairie_contact.profil_demandeur_impose IS 'Contrainte du TÉLÉSERVICE (pas une préférence) : profil de demandeur imposé (entreprise|personne). NULL = libre. Paris = personne (FranceConnect impose l''identité civile).';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN) :
--
--   \d mairie_contact
--     -- max_dossiers_par_demande (integer, NULL) + CHECK > 0 ; profil_demandeur_impose (text, NULL) + CHECK IN (…).
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'mairie_contact_profil_impose_chk';
--     -- doit lister : entreprise, personne
--   SELECT count(*) FROM mairie_contact WHERE max_dossiers_par_demande IS NOT NULL OR profil_demandeur_impose IS NOT NULL;
--     -- doit valoir 0 : cette migration NE POSE AUCUNE valeur.
--
--   -- Contrôles NÉGATIFs (doivent ÉCHOUER), en transaction annulée :
--   -- BEGIN; UPDATE mairie_contact SET max_dossiers_par_demande = 0 WHERE false; ROLLBACK;                 -- viole CHECK > 0
--   -- BEGIN; UPDATE mairie_contact SET profil_demandeur_impose = 'bidon' WHERE false; ROLLBACK;            -- viole la liste
