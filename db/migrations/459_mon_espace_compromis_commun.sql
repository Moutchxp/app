-- 459_mon_espace_compromis_commun.sql — MON ESPACE (Arno, 05/11/2026) : LE COMPROMIS COMMUN À DEUX COLLABORATEURS.
--
-- LE BESOIN (Arno) : un compromis créé dans « Mon espace » par un collaborateur qui ne tient qu'un côté (ou « Pour un collègue ») prévient
-- par mail l'autre collaborateur ; tant que celui-ci n'a pas renseigné ses clients, le compromis est en ROUGE dans SON espace et n'entre pas
-- dans ses totaux. La règle vaut pour les compromis créés À PARTIR de ce lot : les compromis existants ne passent pas en rouge.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL (ni UPDATE, ni DELETE, ni TRUNCATE — déclencheurs) :
--   ① `mon_espace_compromis_commun` : les compromis soumis à la règle (une ligne par compromis créé depuis « Mon espace » à partir de ce lot),
--      avec le créateur et l'heure ;
--   ② `mon_espace_mail_compromis` : le journal des mails envoyés (destinataire, objet, texte et HTML tels qu'ils sont partis, statut, erreur).
-- Aucune table existante n'est touchée ; aucune ligne n'est écrite ici. Sans elle : les compromis se créent comme avant, aucun mail ne part
-- et rien ne passe en rouge.
--
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE. Suppose transaction_vente (433) et admin_utilisateur.

CREATE TABLE IF NOT EXISTS mon_espace_compromis_commun (
  vente_id          bigint      PRIMARY KEY REFERENCES transaction_vente(id),
  cree_le           timestamptz NOT NULL DEFAULT now(),
  cree_par          bigint      REFERENCES admin_utilisateur(id),
  cree_par_libelle  text        NOT NULL CHECK (btrim(cree_par_libelle) <> '')
);

CREATE TABLE IF NOT EXISTS mon_espace_mail_compromis (
  id                bigserial   PRIMARY KEY,
  vente_id          bigint      NOT NULL REFERENCES transaction_vente(id),
  compte_id         bigint      NOT NULL REFERENCES admin_utilisateur(id),
  destinataire      text        NOT NULL,
  objet             text        NOT NULL,
  texte             text        NOT NULL,
  html              text,
  variante          text        NOT NULL CHECK (variante IN ('clients_saisis', 'clients_a_saisir')),
  statut            text        NOT NULL CHECK (statut IN ('envoye', 'echec')),
  erreur            text,
  message_id        text,
  envoye_le         timestamptz NOT NULL DEFAULT now(),
  auteur_id         bigint,
  auteur_libelle    text        NOT NULL CHECK (btrim(auteur_libelle) <> '')
);
CREATE INDEX IF NOT EXISTS mon_espace_mail_compromis_vente ON mon_espace_mail_compromis (vente_id);

COMMENT ON TABLE mon_espace_compromis_commun IS 'Compromis communs créés depuis « Mon espace » (règle « clients à renseigner ») — ajout seul (migration 459).';
COMMENT ON TABLE mon_espace_mail_compromis IS 'Mails « Nouveau compromis commun » envoyés aux autres collaborateurs — ajout seul (migration 459).';

CREATE OR REPLACE FUNCTION mon_espace_compromis_ajout_seul() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% : table en ajout seul (migration 459) — rien ne se modifie ni ne s''efface', TG_TABLE_NAME;
END $$;
DROP TRIGGER IF EXISTS mon_espace_compromis_commun_ajout_seul ON mon_espace_compromis_commun;
CREATE TRIGGER mon_espace_compromis_commun_ajout_seul BEFORE UPDATE OR DELETE ON mon_espace_compromis_commun
  FOR EACH ROW EXECUTE FUNCTION mon_espace_compromis_ajout_seul();
DROP TRIGGER IF EXISTS mon_espace_compromis_commun_no_truncate ON mon_espace_compromis_commun;
CREATE TRIGGER mon_espace_compromis_commun_no_truncate BEFORE TRUNCATE ON mon_espace_compromis_commun
  FOR EACH STATEMENT EXECUTE FUNCTION mon_espace_compromis_ajout_seul();
DROP TRIGGER IF EXISTS mon_espace_mail_compromis_ajout_seul ON mon_espace_mail_compromis;
CREATE TRIGGER mon_espace_mail_compromis_ajout_seul BEFORE UPDATE OR DELETE ON mon_espace_mail_compromis
  FOR EACH ROW EXECUTE FUNCTION mon_espace_compromis_ajout_seul();
DROP TRIGGER IF EXISTS mon_espace_mail_compromis_no_truncate ON mon_espace_mail_compromis;
CREATE TRIGGER mon_espace_mail_compromis_no_truncate BEFORE TRUNCATE ON mon_espace_mail_compromis
  FOR EACH STATEMENT EXECUTE FUNCTION mon_espace_compromis_ajout_seul();
