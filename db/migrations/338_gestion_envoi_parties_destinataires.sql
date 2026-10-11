-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 338 — LOT MAIL-DEPUIS-BIEN-RATTACHEMENT-ET-SUGGESTIONS : LES PARTIES D'UN MAIL ENVOYÉ PAR L'APPLICATION
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ARNO : « un mail envoyé […] est rattaché automatiquement à TOUTE partie dont au moins une adresse figure dans À,
-- Cc ou Cci, quel que soit le bien de cette partie. Cela couvre les clients, les contacts du syndic et le carnet de
-- l'immeuble. Une adresse inconnue reste enregistrée avec le mail, sans partie. Même mécanisme que pour les mails
-- entrants. Aucune écriture rétroactive sur les mails existants. »
--
-- LE MÊME MÉCANISME : `gestion_message_adresse` (migration 256), une ligne par (message, adresse, rôle).
--   · rôle `copie_cachee` : le Cci, connu pour un mail que NOUS envoyons (jamais relevé sur un mail reçu) ;
--   · `partie_externe` + identifiants : un contact du syndic, l'e-mail générique d'un syndic, un contact du carnet
--     de l'immeuble. La colonne `partie` (propriétaire | locataire) reste celle des CLIENTS, inchangée : ses lecteurs
--     n'ont rien à apprendre.
--
-- AUCUNE ÉCRITURE RÉTROACTIVE : `gestion_envoi.parties_demandees` vaut FAUX pour les envois existants (valeur par
-- défaut de l'ajout de colonne), puis VRAI par défaut pour tout envoi créé ensuite. Seuls ceux-là sont traités.
--
-- MIGRATION D'AJOUT : colonnes nullables ou à défaut constant, deux contraintes ÉLARGIES (rien de ce qu'elles
-- acceptaient n'est refusé). AUCUNE ligne existante modifiée. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE gestion_message_adresse DROP CONSTRAINT IF EXISTS gestion_message_adresse_role_chk;
ALTER TABLE gestion_message_adresse ADD CONSTRAINT gestion_message_adresse_role_chk
  CHECK (role IN ('expediteur', 'destinataire', 'copie', 'repondre_a', 'transfere', 'copie_cachee'));

ALTER TABLE gestion_message_adresse ADD COLUMN IF NOT EXISTS partie_externe text;
ALTER TABLE gestion_message_adresse ADD COLUMN IF NOT EXISTS syndic_id bigint;
ALTER TABLE gestion_message_adresse ADD COLUMN IF NOT EXISTS syndic_contact_id bigint;
ALTER TABLE gestion_message_adresse ADD COLUMN IF NOT EXISTS copropriete_contact_id bigint;
ALTER TABLE gestion_message_adresse DROP CONSTRAINT IF EXISTS gestion_message_adresse_partie_externe_chk;
ALTER TABLE gestion_message_adresse ADD CONSTRAINT gestion_message_adresse_partie_externe_chk
  CHECK (partie_externe IS NULL OR partie_externe IN ('syndic', 'syndic_contact', 'immeuble_contact'));

COMMENT ON COLUMN gestion_message_adresse.partie_externe IS
  '338 — la partie NON CLIENTE reconnue sur un mail envoyé par l''application : l''e-mail générique d''un syndic, '
  'un contact du syndic, un contact du carnet de l''immeuble. NULL = aucune (la colonne partie dit les clients).';

ALTER TABLE gestion_envoi ADD COLUMN IF NOT EXISTS parties_demandees boolean NOT NULL DEFAULT false;
ALTER TABLE gestion_envoi ALTER COLUMN parties_demandees SET DEFAULT true;
ALTER TABLE gestion_envoi ADD COLUMN IF NOT EXISTS parties_appliquees_le timestamptz;
ALTER TABLE gestion_envoi ADD COLUMN IF NOT EXISTS parties_message_id bigint;

COMMENT ON COLUMN gestion_envoi.parties_demandees IS
  '338 — vrai pour tout envoi créé APRÈS cette migration : ses destinataires (À, Cc, Cci) seront reconnus sur le '
  'message capturé. Faux pour les envois d''avant : aucune écriture rétroactive.';

COMMIT;
