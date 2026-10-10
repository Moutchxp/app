-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 332 — LOT SYNDIC-CONTACT-PARTI-ET-BOUTON-CREER-EN-HAUT : UN CONTACT DE SYNDIC QUI « NE TRAVAILLE PLUS ICI »
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ARNO : « retirer du catalogue un contact qui a quitté le cabinet » — marqué « parti » avec la date et l'auteur, sans
-- être effacé ; ses coordonnées restent en base pour l'historique ; « Réintégrer au catalogue » s'il revient.
--
-- MIGRATION D'AJOUT UNIQUEMENT : cinq colonnes nullables, sans valeur par défaut — AUCUN contact existant n'est
-- modifié (aucun n'est « parti »). Idempotente (IF NOT EXISTS).
--   · parti_le / parti_par / parti_par_libelle : le DERNIER départ (qui, quand). NULL = au catalogue.
--   · reintegre_le / reintegre_par_libelle     : la dernière réintégration — la trace qu'un départ a été défait.
-- Le départ ferme aussi les affectations (motif « contact parti ») et retire les coordonnées (`retire_le`, à l'instant
-- même du départ) : l'e-mail redevient libre pour l'index 327, la ligne reste en base.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE gestion_syndic_contact
  ADD COLUMN IF NOT EXISTS parti_le timestamptz,
  ADD COLUMN IF NOT EXISTS parti_par bigint,
  ADD COLUMN IF NOT EXISTS parti_par_libelle text,
  ADD COLUMN IF NOT EXISTS reintegre_le timestamptz,
  ADD COLUMN IF NOT EXISTS reintegre_par_libelle text;
COMMENT ON COLUMN gestion_syndic_contact.parti_le IS
  'Lot SYNDIC-CONTACT-PARTI (332) — « ne travaille plus ici » : hors du catalogue, gardé en base. NULL = au catalogue.';
