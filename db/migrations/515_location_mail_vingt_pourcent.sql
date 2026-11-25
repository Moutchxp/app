-- 515_location_mail_vingt_pourcent.sql — 🔴 « ENVOYER UN MAIL » DEPUIS « 20 % À RESTITUER » : LE LIEN ENTRE UN ENVOI ET SA LIGNE (Arno, 25/11/2026).
--
-- LE BESOIN (demande d'Arno du 25/11/2026) : « Lorsqu'un mail a été envoyé depuis le module 20 %, il faut que cela soit indiqué dans le bloc en format
-- fermé (x mail(s) envoyé(s) depuis cette page) » ; dans le détail, la liste de ces mails (date, destinataire, modèle utilisé) avec lien vers le mail.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL : une table, une ligne par demande d'envoi partie du module d'une ligne de l'écran (la sortie validée, la clé
-- d'idempotence de l'envoi — la même que dans gestion_envoi et gestion_envoi_file —, le modèle choisi). Ce n'est PAS le compte : le compte ne retient
-- que les envois réellement PARTIS (gestion_envoi.etat = 'envoye', hors simulation de la recette). Ajout seul (déclencheurs : ni UPDATE, ni DELETE, ni
-- TRUNCATE). Aucune donnée existante touchée. Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE : rejouable.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, rien n'est noté et la mention n'apparaît pas ; l'envoi lui-même ne change pas.

CREATE TABLE IF NOT EXISTS gestion_location_mail_vingt (
  id bigserial PRIMARY KEY,
  sortie_validee_id bigint NOT NULL REFERENCES gestion_location_sortie_validee(id),
  cle_idempotence text NOT NULL,
  modele text NULL CHECK (modele IS NULL OR modele IN ('syndic', 'proprietaire', 'syndic_copie', 'locataire')),
  demande_le timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gestion_location_mail_vingt_cle ON gestion_location_mail_vingt (cle_idempotence);
CREATE INDEX IF NOT EXISTS gestion_location_mail_vingt_sortie ON gestion_location_mail_vingt (sortie_validee_id, demande_le);

CREATE OR REPLACE FUNCTION gestion_location_mail_vingt_ajout_seul() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% : table en ajout seul (migration 515) — rien ne se modifie ni ne s''efface', TG_TABLE_NAME;
END $$;
DROP TRIGGER IF EXISTS gestion_location_mail_vingt_ajout_seul ON gestion_location_mail_vingt;
CREATE TRIGGER gestion_location_mail_vingt_ajout_seul BEFORE UPDATE OR DELETE ON gestion_location_mail_vingt
  FOR EACH ROW EXECUTE FUNCTION gestion_location_mail_vingt_ajout_seul();
DROP TRIGGER IF EXISTS gestion_location_mail_vingt_no_truncate ON gestion_location_mail_vingt;
CREATE TRIGGER gestion_location_mail_vingt_no_truncate BEFORE TRUNCATE ON gestion_location_mail_vingt
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_location_mail_vingt_ajout_seul();

COMMENT ON TABLE gestion_location_mail_vingt IS
  'Mails partis du module « Envoyer un mail » d''une ligne de « 20 % à restituer » : la sortie, la clé d''idempotence de l''envoi, le modèle ; ajout seul — migration 515.';
