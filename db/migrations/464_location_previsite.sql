-- 464_location_previsite.sql — LOCATION (Arno, 10/11/2026) : LE SUIVI DE LA PRÉ-VISITE D'ÉTAT DES LIEUX DE SORTIE DANS LES PRÉAVIS.
--
-- LE BESOIN (Arno) : chaque préavis a un statut de pré-visite (alerte, reçu, programmée, effectuée, refusée / absente) ; si AUCUN
-- rendez-vous de pré-visite n'est SAISI dans les 10 jours qui suivent la réception, le préavis passe en alerte au 11e jour et UN SEUL mail
-- part à chaque collaborateur ayant accès à Gestion et/ou Location — jamais deux fois pour la même alerte.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL :
--   · `gestion_location_previsite` — UNE ligne par préavis (les locataires d'un même bail reçus ensemble : `cle`), créée au premier fait :
--     le rendez-vous (une TÂCHE du module de tâches, `tache_id`), la date de sa PREMIÈRE saisie (c'est elle qui compte pour l'alerte), son
--     dernier déplacement, l'alerte envoyée (une fois : `alerte_envoyee_le`, posée par un UPDATE … WHERE alerte_envoyee_le IS NULL),
--     l'invitation au compte rendu envoyée, le compte rendu (effectuée), le mail de refus / absence. Jamais effacée (déclencheur) ;
--     close (`clos_le`) seulement ;
--   · le journal des mails de la Location (457, élargi en 461) accepte les sortes de la pré-visite : la liste autorisée S'ÉLARGIT (les
--     sortes d'avant restent valides ; aucune ligne touchée).
-- Aucune table existante n'est modifiée dans ses données.
--
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE. Suppose gestion_annuaire_lot et gestion_tache (346).
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, les préavis s'affichent comme avant, sans statut de pré-visite ni bouton.

CREATE TABLE IF NOT EXISTS gestion_location_previsite (
  id                      bigserial   PRIMARY KEY,
  cle                     text        NOT NULL CHECK (btrim(cle) <> ''),
  lot_id                  bigint      NOT NULL REFERENCES gestion_annuaire_lot(id),
  occupation_ids          bigint[]    NOT NULL,
  recu_le                 date        NOT NULL,
  tache_id                bigint      REFERENCES gestion_tache(id),
  rdv_saisi_le            timestamptz,
  rdv_saisi_par_libelle   text,
  rdv_modifie_le          timestamptz,
  alerte_envoyee_le       timestamptz,
  cr_invitation_le        timestamptz,
  effectuee_le            timestamptz,
  effectuee_par_libelle   text,
  refus_le                timestamptz,
  refus_par_libelle       text,
  cree_le                 timestamptz NOT NULL DEFAULT now(),
  clos_le                 timestamptz,
  clos_motif              text
);

-- Un seul suivi OUVERT par préavis.
CREATE UNIQUE INDEX IF NOT EXISTS gestion_location_previsite_cle_ouverte ON gestion_location_previsite (cle) WHERE clos_le IS NULL;
CREATE INDEX IF NOT EXISTS gestion_location_previsite_occupations ON gestion_location_previsite USING gin (occupation_ids);

COMMENT ON TABLE gestion_location_previsite IS
  'Suivi de la pré-visite d''état des lieux de sortie d''un préavis : rendez-vous (tâche), première saisie, alerte (une fois), compte rendu, refus / absence — jamais effacé (migration 464).';
COMMENT ON COLUMN gestion_location_previsite.rdv_saisi_le IS
  'La PREMIÈRE saisie d''un rendez-vous de pré-visite : c''est elle (et non la date du rendez-vous) qui lève l''alerte du 11e jour.';
COMMENT ON COLUMN gestion_location_previsite.alerte_envoyee_le IS
  'Le mail d''alerte aux collaborateurs est parti : posé une seule fois (UPDATE … WHERE alerte_envoyee_le IS NULL), jamais deux mails pour la même alerte.';

CREATE OR REPLACE FUNCTION gestion_location_previsite_sans_effacement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% : rien ne s''efface (migration 464) — un suivi se clôt (clos_le)', TG_TABLE_NAME;
END $$;
DROP TRIGGER IF EXISTS gestion_location_previsite_sans_effacement ON gestion_location_previsite;
CREATE TRIGGER gestion_location_previsite_sans_effacement BEFORE DELETE ON gestion_location_previsite
  FOR EACH ROW EXECUTE FUNCTION gestion_location_previsite_sans_effacement();
DROP TRIGGER IF EXISTS gestion_location_previsite_no_truncate ON gestion_location_previsite;
CREATE TRIGGER gestion_location_previsite_no_truncate BEFORE TRUNCATE ON gestion_location_previsite
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_location_previsite_sans_effacement();

DO $$ BEGIN
  IF to_regclass('public.gestion_location_mail_avis') IS NOT NULL THEN
    ALTER TABLE gestion_location_mail_avis DROP CONSTRAINT IF EXISTS gestion_location_mail_avis_sorte_check;
    ALTER TABLE gestion_location_mail_avis ADD CONSTRAINT gestion_location_mail_avis_sorte_check
      CHECK (sorte IN ('preavis_locataires', 'preavis_adhoc', 'sortie_adhoc', 'sortie_locataires',
        'previsite_alerte', 'previsite_invitation', 'previsite_reponse', 'previsite_locataires', 'previsite_locataires_modif',
        'previsite_invitation_cr', 'previsite_compte_rendu', 'previsite_refus', 'previsite_annulation'));
  END IF;
END $$;
