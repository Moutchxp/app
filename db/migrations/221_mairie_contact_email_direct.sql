-- 221_mairie_contact_email_direct.sql — E-MAIL DIRECT (informatif) d'un contact de mairie.
--
-- POURQUOI : la fiche contact ne portait qu'une adresse e-mail, celle du SERVICE urbanisme (colonne `email`). On veut noter
-- EN PLUS l'e-mail nominatif d'une personne (typiquement le responsable du service, joignable derrière le standard).
--
-- INVARIANT MÉTIER (déjà tranché) : ce nouvel e-mail est PUREMENT INFORMATIF. Il n'est JAMAIS destinataire d'un envoi, JAMAIS
-- pris en compte pour le rail, JAMAIS lu par la chaîne d'envoi ou de relance automatique. Le destinataire reste `email` (service),
-- seul regardé par la contrainte `mairie_contact_coherence_chk` et par `resoudreDestination`. Cette colonne n'est câblée dans
-- AUCUN chemin d'envoi (elle n'apparaît pas dans `destinataire.ContactCommune`).
--
-- SÛR : DDL additive et IDEMPOTENTE (ADD COLUMN IF NOT EXISTS). Un SEUL ADD COLUMN, NULLABLE, SANS valeur par défaut. Aucune
-- modification de donnée existante ; aucun DELETE/TRUNCATE/DROP ; aucune autre instruction. NULL = non renseigné (défaut de la
-- colonne pour toutes les lignes existantes, sans backfill).
--
-- Application MANUELLE (base locale) :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/221_mairie_contact_email_direct.sql

ALTER TABLE mairie_contact ADD COLUMN IF NOT EXISTS email_direct text;
