-- 066_mairie_protocole.sql — Module VEILLE PERMIS (chantier S18) : annuaire de PROTOCOLE par commune.
--
-- MOTIF : le protocole de consultation des dossiers d'urbanisme (téléphone du service, responsable, téléservice, date de
-- dernière vérification) n'a nulle part où vivre. On l'ajoute à `mairie_contact`. Ces informations proviennent d'une
-- VÉRIFICATION MANUELLE sur les sites officiels des communes : AUCUNE source structurée n'existe pour les rafraîchir
-- automatiquement. `protocole_verifie_le` sert précisément à REPÉRER les informations qui vieillissent (revue périodique).
--
-- SÛR : DDL ADDITIVE uniquement (ADD COLUMN IF NOT EXISTS). Aucun DROP, aucun NOT NULL sans défaut (toutes NULLABLE).
-- Aucune modif de commune / demande / config_* / sitadel_*. GOLDEN-SAFE. Idempotent. Un seul BEGIN/COMMIT. Application
-- MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/066_mairie_protocole.sql
-- Vérification : \d mairie_contact

BEGIN;

ALTER TABLE mairie_contact ADD COLUMN IF NOT EXISTS telephone           text;
ALTER TABLE mairie_contact ADD COLUMN IF NOT EXISTS responsable_nom     text;
ALTER TABLE mairie_contact ADD COLUMN IF NOT EXISTS protocole_verifie_le date;
ALTER TABLE mairie_contact ADD COLUMN IF NOT EXISTS protocole_source    text;

COMMENT ON COLUMN mairie_contact.telephone IS 'Téléphone du service urbanisme / droit des sols. Relevé par VÉRIFICATION MANUELLE sur le site officiel de la commune (aucune source structurée pour un rafraîchissement automatique).';
COMMENT ON COLUMN mairie_contact.responsable_nom IS 'Nom du responsable du service urbanisme, quand il est publié. Vérification manuelle (site officiel).';
COMMENT ON COLUMN mairie_contact.protocole_verifie_le IS 'Date de DERNIÈRE vérification manuelle du protocole de consultation. Sert à repérer les informations qui vieillissent (aucun rafraîchissement automatique possible).';
COMMENT ON COLUMN mairie_contact.protocole_source IS 'URL de la page officielle d''où provient l''information de protocole (traçabilité de la vérification manuelle).';

COMMIT;
