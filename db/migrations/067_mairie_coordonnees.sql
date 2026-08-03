-- 067_mairie_coordonnees.sql — Module VEILLE PERMIS (chantier S19) : coordonnées enrichies de la mairie.
--
-- MOTIF : préciser QUI on contacte, sans ajouter d'ambiguïté sur le destinataire.
--   • telephone_standard : le standard général de la mairie, EN PLUS du `telephone` existant (qui reste, comme son
--     libellé le dit, le téléphone du SERVICE urbanisme / droit des sols).
--   • email_type : la NATURE de l'adresse e-mail enregistrée — PAS une seconde adresse. ⚠️ Il n'y a et n'y aura qu'UNE
--     adresse e-mail par commune (`mairie_contact.email`) : c'est ELLE qui reçoit les demandes. `email_type` dit seulement
--     si l'on écrit au service compétent ('urbanisme'), à un accueil général ('accueil'), à la PRADA ('prada'), ou si on
--     l'ignore ('inconnu'). Créer un second champ e-mail rendrait le destinataire ambigu : on ne le fait pas.
--
-- SÛR : DDL ADDITIVE uniquement (ADD COLUMN IF NOT EXISTS). Aucun DROP, aucun NOT NULL sans défaut (toutes NULLABLE).
-- Aucune modif de commune / demande / config_* / sitadel_*. GOLDEN-SAFE. Idempotent (IF NOT EXISTS + garde DO/EXCEPTION
-- sur la contrainte). Un seul BEGIN/COMMIT. Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/067_mairie_coordonnees.sql
-- Vérification : \d mairie_contact

BEGIN;

ALTER TABLE mairie_contact ADD COLUMN IF NOT EXISTS telephone_standard text;
ALTER TABLE mairie_contact ADD COLUMN IF NOT EXISTS email_type         text;
DO $$ BEGIN
  ALTER TABLE mairie_contact ADD CONSTRAINT mairie_contact_email_type_chk CHECK (email_type IN ('urbanisme','accueil','prada','inconnu'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN mairie_contact.telephone_standard IS 'Standard général de la mairie (distinct de `telephone`, qui reste le téléphone du service urbanisme / droit des sols).';
COMMENT ON COLUMN mairie_contact.email_type IS 'NATURE de l''unique adresse e-mail (`email`), PAS une seconde adresse : urbanisme | accueil | prada | inconnu. Une seule adresse reçoit les demandes ; ce champ dit seulement si on écrit au service compétent ou à un accueil général. NULL = non renseigné (honnête : on ne sait pas).';

COMMIT;
