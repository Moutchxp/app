-- 457_location_mails_preavis_sortie.sql — LOCATION (Arno, 05/11/2026) : LES MAILS AUTOMATIQUES DU PRÉAVIS ET DE LA SORTIE.
--
-- LE BESOIN (Arno) : à la validation d'un préavis (un ou plusieurs locataires d'un même logement), deux mails partent de
-- gestion@criterimmo.fr — l'accusé de réception du congé aux locataires, et un mail d'information à ADHOC (bien en gestion
-- seulement) ; à la validation d'une sortie, un mail d'information à ADHOC (bien en gestion seulement). « Chaque préavis, sortie
-- et envoi est daté et attribué à la personne connectée. »
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL : `gestion_location_mail_avis` — le JOURNAL de ces mails, un par mail construit : sa sorte, le
-- logement, les occupations concernées, l'expéditeur, les destinataires (À, Cc), l'objet, le texte et le HTML TELS QU'ILS SONT
-- PARTIS, le statut (envoyé / échec), l'erreur, le Message-ID, la personne qui a validé et l'heure. Ni UPDATE, ni DELETE, ni
-- TRUNCATE (déclencheur). Aucune table existante n'est touchée ; aucune ligne n'est écrite ici.
--
-- Sans elle, le préavis et la sortie s'enregistrent comme avant et AUCUN de ces mails ne part (le journal est une condition de
-- l'envoi, comme pour « Nouvelle location », migration 395).
--
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE. Suppose gestion_annuaire_lot.

CREATE TABLE IF NOT EXISTS gestion_location_mail_avis (
  id                 bigserial   PRIMARY KEY,
  sorte              text        NOT NULL CHECK (sorte IN ('preavis_locataires', 'preavis_adhoc', 'sortie_adhoc')),
  lot_id             bigint      NOT NULL REFERENCES gestion_annuaire_lot(id),
  occupation_ids     bigint[]    NOT NULL DEFAULT '{}',
  expediteur         text        NOT NULL,
  destinataires      text[]      NOT NULL,
  copies             text[]      NOT NULL DEFAULT '{}',
  objet              text        NOT NULL,
  texte              text        NOT NULL,
  html               text,
  statut             text        NOT NULL CHECK (statut IN ('envoye', 'echec')),
  erreur             text,
  message_id         text,
  envoye_le          timestamptz NOT NULL DEFAULT now(),
  auteur_id          bigint,
  auteur_libelle     text        NOT NULL CHECK (btrim(auteur_libelle) <> '')
);

CREATE INDEX IF NOT EXISTS gestion_location_mail_avis_lot ON gestion_location_mail_avis (lot_id, envoye_le DESC);

COMMENT ON TABLE gestion_location_mail_avis IS
  'Journal des mails automatiques du préavis (accusé aux locataires, information ADHOC) et de la sortie (information ADHOC) — ajout seul (migration 457).';

CREATE OR REPLACE FUNCTION gestion_location_mail_avis_ajout_seul() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% : table en ajout seul (migration 457) — rien ne se modifie ni ne s''efface', TG_TABLE_NAME;
END $$;
DROP TRIGGER IF EXISTS gestion_location_mail_avis_ajout_seul ON gestion_location_mail_avis;
CREATE TRIGGER gestion_location_mail_avis_ajout_seul BEFORE UPDATE OR DELETE ON gestion_location_mail_avis
  FOR EACH ROW EXECUTE FUNCTION gestion_location_mail_avis_ajout_seul();
DROP TRIGGER IF EXISTS gestion_location_mail_avis_no_truncate ON gestion_location_mail_avis;
CREATE TRIGGER gestion_location_mail_avis_no_truncate BEFORE TRUNCATE ON gestion_location_mail_avis
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_location_mail_avis_ajout_seul();
