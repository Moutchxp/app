-- 465_gestion_tache_invitation_contacts.sql — GESTION (Arno, 10/11/2026) : INVITER LES CONTACTS D'UNE TÂCHE, EN TOUTE CONFIDENTIALITÉ ; LE TIERS
-- INDÉPENDANT D'UN BIEN.
--
-- LE BESOIN (Arno) :
--   · pour CHAQUE contact ajouté à une tâche, une case « Envoyer une invitation à ce contact », DÉCOCHÉE par défaut : sans case cochée, le
--     contact ne reçoit rien ; cochée, il reçoit SON mail (seul destinataire) — titre, date / heure, durée, adresse du bien, notes, signature
--     de l'agence — jamais le nom, le téléphone ou l'e-mail d'un autre contact, client ou collaborateur ;
--   · une tâche rattachée à UN SEUL bien : un contact ajouté qui n'existe pas dans l'historique de ce bien y est ajouté comme « tiers
--     indépendant » (nom, rôle, téléphone, e-mail), avec trace au journal.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL :
--   · `gestion_tache_contact.inviter` (faux par défaut : TOUTES les lignes existantes restent « non invitées », rien ne part pour elles) ;
--   · `gestion_tache_contact_envoi` — le journal des mails partis (ou en échec) vers un contact extérieur : invitation, modification,
--     annulation ; ajout seul (ni UPDATE, ni DELETE, ni TRUNCATE) ;
--   · `gestion_bien_tiers` — les tiers indépendants d'un bien posés par une tâche ; jamais effacés (retirés seulement).
-- Aucune donnée existante n'est modifiée.
--
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE. Suppose gestion_tache_contact (347) et
-- gestion_annuaire_lot.
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, la case n'est pas proposée, aucun contact n'est invité, aucun tiers n'est posé.

ALTER TABLE gestion_tache_contact ADD COLUMN IF NOT EXISTS inviter boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN gestion_tache_contact.inviter IS
  'La case « Envoyer une invitation à ce contact » (décochée par défaut) : vrai ⇒ ce contact reçoit SON mail, sans coordonnées de tiers (migration 465).';

CREATE TABLE IF NOT EXISTS gestion_tache_contact_envoi (
  id              bigserial   PRIMARY KEY,
  tache_id        bigint      NOT NULL REFERENCES gestion_tache(id),
  contact_id      bigint      NOT NULL REFERENCES gestion_tache_contact(id),
  sorte           text        NOT NULL CHECK (sorte IN ('invitation', 'modification', 'annulation')),
  email           text        NOT NULL,
  objet           text        NOT NULL,
  texte           text        NOT NULL,
  statut          text        NOT NULL CHECK (statut IN ('envoye', 'echec')),
  erreur          text,
  message_id      text,
  envoye_le       timestamptz NOT NULL DEFAULT now(),
  auteur_id       bigint,
  auteur_libelle  text        NOT NULL CHECK (btrim(auteur_libelle) <> '')
);
CREATE INDEX IF NOT EXISTS gestion_tache_contact_envoi_tache ON gestion_tache_contact_envoi (tache_id, envoye_le DESC);
COMMENT ON TABLE gestion_tache_contact_envoi IS
  'Journal des mails envoyés à un contact EXTÉRIEUR d''une tâche (un destinataire par mail, aucune coordonnée de tiers) — ajout seul (migration 465).';

CREATE TABLE IF NOT EXISTS gestion_bien_tiers (
  id                bigserial   PRIMARY KEY,
  lot_id            bigint      NOT NULL REFERENCES gestion_annuaire_lot(id),
  nom               text        NOT NULL CHECK (btrim(nom) <> ''),
  role              text,
  telephone         text,
  email             text,
  tache_id          bigint      REFERENCES gestion_tache(id),
  cree_le           timestamptz NOT NULL DEFAULT now(),
  cree_par          bigint,
  cree_par_libelle  text        NOT NULL CHECK (btrim(cree_par_libelle) <> ''),
  retire_le         timestamptz,
  retire_par_libelle text
);
CREATE UNIQUE INDEX IF NOT EXISTS gestion_bien_tiers_unique ON gestion_bien_tiers (lot_id, lower(btrim(nom)), lower(coalesce(btrim(email), '')))
  WHERE retire_le IS NULL;
COMMENT ON TABLE gestion_bien_tiers IS
  'Les tiers indépendants d''un bien posés par une tâche rattachée à ce SEUL bien (nom, rôle, téléphone, e-mail) — jamais effacés (migration 465).';

CREATE OR REPLACE FUNCTION gestion_tache_invitation_ajout_seul() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% : rien ne s''efface (migration 465)', TG_TABLE_NAME;
END $$;
DROP TRIGGER IF EXISTS gestion_tache_contact_envoi_ajout_seul ON gestion_tache_contact_envoi;
CREATE TRIGGER gestion_tache_contact_envoi_ajout_seul BEFORE UPDATE OR DELETE ON gestion_tache_contact_envoi
  FOR EACH ROW EXECUTE FUNCTION gestion_tache_invitation_ajout_seul();
DROP TRIGGER IF EXISTS gestion_tache_contact_envoi_no_truncate ON gestion_tache_contact_envoi;
CREATE TRIGGER gestion_tache_contact_envoi_no_truncate BEFORE TRUNCATE ON gestion_tache_contact_envoi
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_tache_invitation_ajout_seul();
DROP TRIGGER IF EXISTS gestion_bien_tiers_sans_effacement ON gestion_bien_tiers;
CREATE TRIGGER gestion_bien_tiers_sans_effacement BEFORE DELETE ON gestion_bien_tiers
  FOR EACH ROW EXECUTE FUNCTION gestion_tache_invitation_ajout_seul();
DROP TRIGGER IF EXISTS gestion_bien_tiers_no_truncate ON gestion_bien_tiers;
CREATE TRIGGER gestion_bien_tiers_no_truncate BEFORE TRUNCATE ON gestion_bien_tiers
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_tache_invitation_ajout_seul();
