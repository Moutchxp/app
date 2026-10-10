-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 330 — LOT SYNDIC-CONTACT-CIVILITE : UNE CIVILITÉ FACULTATIVE SUR LES CONTACTS DE SYNDIC
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ARNO : « une CIVILITÉ facultative sur les contacts de syndic, pour la future rédaction automatique des mails ».
-- Valeurs : « M. », « Mme », ou vide (NULL). Facultative, vide par défaut.
--
-- MIGRATION D'AJOUT UNIQUEMENT : une colonne nullable, sans valeur par défaut — AUCUN contact existant n'est
-- modifié (ils restent sans civilité). La contrainte n'admet que les deux valeurs. Idempotente (IF NOT EXISTS :
-- rejouée, la colonne et sa contrainte ne sont pas recréées).
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE gestion_syndic_contact
  ADD COLUMN IF NOT EXISTS civilite text CONSTRAINT gestion_syndic_contact_civilite_valeurs CHECK (civilite IN ('M.', 'Mme'));
COMMENT ON COLUMN gestion_syndic_contact.civilite IS
  'Lot SYNDIC-CONTACT-CIVILITE (330) — « M. », « Mme » ou NULL (non renseignée). Sert à la formule d''appel des mails.';
