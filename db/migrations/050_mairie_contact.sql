-- 050_mairie_contact.sql — Module VEILLE PERMIS (chantier S5) : registre des adresses e-mail des MAIRIES.
--
-- MOTIF : préparer l'adressage des demandes de communication de permis (CRPA) — à la MAIRIE (l'annuaire ne modélise
-- aucun « service urbanisme » communal ; les demandes vont à la commune). Ce chantier CONSTITUE et AFFICHE le registre ;
-- il NE PRODUIT AUCUN ENVOI (chantiers ultérieurs).
--
-- ⚠️ CONTACT SÉPARÉ DE `commune` : la table `commune` est 100 % dérivée d'un import IGN ADMIN EXPRESS idempotent et
-- REJOUABLE (commune-import). Y ajouter une colonne de contact serait ÉCRASÉ au prochain ré-import. Les contacts vivent
-- donc dans une table dédiée, reliée par `code_insee` (FK → commune). Les 4 codes Sitadel orphelins (sans commune) n'ont
-- donc pas de contact : la tuile les affiche « commune inconnue ».
--
-- SOURCE des e-mails : annuaire de l'administration (DILA / service-public.fr), Licence Ouverte (Etalab-famille).
-- À l'import : source='annuaire', statut='presume'. Une correction manuelle passe source='saisie_manuelle',
-- statut='confirme'. RIEN n'est jamais écrasé sans trace → tout changement écrit une ligne de journal.
--
-- SÛR : DDL uniquement. Idempotent (IF NOT EXISTS). GOLDEN-SAFE (aucun contact moteur/config_scoring/batiment).
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/050_mairie_contact.sql
-- Vérification : \d mairie_contact · \d mairie_contact_journal

BEGIN;

-- Registre courant : AU PLUS un contact par commune. FK → commune (contact réservé aux communes connues).
CREATE TABLE IF NOT EXISTS mairie_contact (
  code_insee char(5) PRIMARY KEY REFERENCES commune(code_insee),
  email      text,
  source     text NOT NULL DEFAULT 'annuaire' CHECK (source IN ('annuaire','saisie_manuelle','reponse_mairie')),
  statut     text NOT NULL DEFAULT 'presume'  CHECK (statut IN ('presume','confirme','invalide')),
  maj_le     timestamptz NOT NULL DEFAULT now(),
  note       text
);

COMMENT ON TABLE mairie_contact IS 'Registre e-mail des mairies (séparé de `commune`, table IGN rejouable). source: annuaire|saisie_manuelle|reponse_mairie ; statut: presume|confirme|invalide. À l''import : annuaire/presume.';

-- Journal APPEND-ONLY : toute modification d'adresse écrit une ligne, Y COMPRIS le premier renseignement. Aucun FK
-- (trace conservée même si une commune disparaissait d'un ré-import). Rien n'est écrasé sans trace.
CREATE TABLE IF NOT EXISTS mairie_contact_journal (
  id          bigserial PRIMARY KEY,
  code_insee  char(5) NOT NULL,
  email_avant text,
  email_apres text,
  source      text,
  motif       text,
  auteur      text,                                  -- id admin (saisie manuelle) ou NULL/'import' (automatique)
  horodatage  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE mairie_contact_journal IS 'Historique append-only des changements d''adresse de mairie (email_avant→email_apres). Une ligne par changement, y compris le 1er renseignement. Jamais écrasé.';

CREATE INDEX IF NOT EXISTS mairie_contact_journal_code_idx ON mairie_contact_journal (code_insee, horodatage);

COMMIT;
