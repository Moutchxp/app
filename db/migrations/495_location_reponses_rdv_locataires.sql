-- 495_location_reponses_rdv_locataires.sql — 🔴🔴 LA RÉPONSE DES LOCATAIRES AUX RENDEZ-VOUS (pré-visite, état des lieux de sortie) (Arno, 18/11/2026).
--
-- LA DÉCISION (Arno, 18/11/2026) : « Chaque locataire invité reçoit dans son mail deux boutons, « J'accepte le rendez-vous » et « Je refuse ».
-- Ces boutons sont des liens personnels sécurisés, sans connexion : un jeton fort par locataire et par rendez-vous, qui expire à la date du
-- rendez-vous. […] Chaque réponse est datée et journalisée, rien n'est jamais supprimé. » ; « VALIDATION À LA MAIN […] réversible » ; réponses
-- A / oui / oui du 18/11/2026 (deux cartouches, invitation des locataires à l'état des lieux, mail interne à qui a fixé le rendez-vous).
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL :
--   · `gestion_rdv_jeton` : un lien personnel par locataire (occupation) et par CRÉNEAU d'un rendez-vous (sa tâche) ; seule l'EMPREINTE du jeton
--     est gardée (sha256) ; il expire à l'heure du rendez-vous ;
--   · `gestion_rdv_reponse` : le journal, en AJOUT SEUL (ni UPDATE, ni DELETE, ni TRUNCATE — déclencheur) : chaque réponse (accepte / refuse),
--     chaque validation à la main et son annulation, chaque mail interne parti ; chacun porte le créneau : après un déplacement, les réponses
--     d'avant restent en base et ne comptent plus (caduques) ;
--   · `gestion_config.reponses_rdv_actives` : l'interrupteur des NOUVEAUX ENVOIS aux locataires (boutons dans l'invitation de pré-visite,
--     invitation à l'état des lieux) — ÉTEINT par défaut : aucun vrai locataire ne reçoit un nouveau texte avant qu'Arno l'ait validé ;
--   · la contrainte des sortes de mails de la Location (484) est remplacée par la même, élargie de quatre sortes.
-- Aucune ligne existante touchée. Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE.
-- ⚠️ Sans elle : les mails partent comme avant (sans boutons), aucun cartouche « Locataires », aucune validation à la main.

CREATE TABLE IF NOT EXISTS gestion_rdv_jeton (
  id                bigserial   PRIMARY KEY,
  tache_id          bigint      NOT NULL REFERENCES gestion_tache (id),
  sorte             text        NOT NULL CHECK (sorte IN ('previsite', 'edl')),
  occupation_id     bigint      NOT NULL REFERENCES gestion_annuaire_occupation (id),
  occupation_ids    bigint[]    NOT NULL,
  creneau           text        NOT NULL CHECK (creneau ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$'),
  duree_minutes     integer     NULL CHECK (duree_minutes IS NULL OR duree_minutes > 0),
  jeton_empreinte   text        NOT NULL UNIQUE CHECK (jeton_empreinte ~ '^[0-9a-f]{64}$'),
  expire_le         timestamptz NOT NULL,
  cree_le           timestamptz NOT NULL DEFAULT now(),
  cree_par_libelle  text        NOT NULL CHECK (btrim(cree_par_libelle) <> '')
);
CREATE INDEX IF NOT EXISTS gestion_rdv_jeton_tache_idx ON gestion_rdv_jeton (tache_id, creneau);

CREATE TABLE IF NOT EXISTS gestion_rdv_reponse (
  id             bigserial   PRIMARY KEY,
  tache_id       bigint      NOT NULL REFERENCES gestion_tache (id),
  sorte          text        NOT NULL CHECK (sorte IN ('previsite', 'edl')),
  creneau        text        NOT NULL CHECK (creneau ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$'),
  nature         text        NOT NULL CHECK (nature IN ('accepte', 'refuse', 'validation_main', 'annulation_validation', 'notifie_confirme', 'notifie_refus')),
  jeton_id       bigint      NULL REFERENCES gestion_rdv_jeton (id),
  occupation_id  bigint      NULL REFERENCES gestion_annuaire_occupation (id),
  par_id         bigint      NULL REFERENCES admin_utilisateur (id),
  par_libelle    text        NOT NULL CHECK (btrim(par_libelle) <> ''),
  le             timestamptz NOT NULL DEFAULT now(),
  -- une réponse d'un locataire porte son lien ; une validation à la main, son auteur (jamais l'un sans l'autre)
  CONSTRAINT gestion_rdv_reponse_jeton_chk CHECK ((nature IN ('accepte', 'refuse')) = (jeton_id IS NOT NULL AND occupation_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS gestion_rdv_reponse_tache_idx ON gestion_rdv_reponse (tache_id, creneau, le);

CREATE OR REPLACE FUNCTION gestion_rdv_refuser() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% : % refusé — les liens et les réponses des locataires s''écrivent en ajout seul (migration 495)', TG_TABLE_NAME, TG_OP;
END $$;
DROP TRIGGER IF EXISTS gestion_rdv_reponse_ajout_seul ON gestion_rdv_reponse;
CREATE TRIGGER gestion_rdv_reponse_ajout_seul BEFORE UPDATE OR DELETE ON gestion_rdv_reponse FOR EACH STATEMENT EXECUTE FUNCTION gestion_rdv_refuser();
DROP TRIGGER IF EXISTS gestion_rdv_reponse_no_truncate ON gestion_rdv_reponse;
CREATE TRIGGER gestion_rdv_reponse_no_truncate BEFORE TRUNCATE ON gestion_rdv_reponse FOR EACH STATEMENT EXECUTE FUNCTION gestion_rdv_refuser();
DROP TRIGGER IF EXISTS gestion_rdv_jeton_ajout_seul ON gestion_rdv_jeton;
CREATE TRIGGER gestion_rdv_jeton_ajout_seul BEFORE UPDATE OR DELETE ON gestion_rdv_jeton FOR EACH STATEMENT EXECUTE FUNCTION gestion_rdv_refuser();
DROP TRIGGER IF EXISTS gestion_rdv_jeton_no_truncate ON gestion_rdv_jeton;
CREATE TRIGGER gestion_rdv_jeton_no_truncate BEFORE TRUNCATE ON gestion_rdv_jeton FOR EACH STATEMENT EXECUTE FUNCTION gestion_rdv_refuser();

ALTER TABLE gestion_config ADD COLUMN IF NOT EXISTS reponses_rdv_actives boolean NOT NULL DEFAULT false;

ALTER TABLE gestion_location_mail_avis DROP CONSTRAINT IF EXISTS gestion_location_mail_avis_sorte_check;
ALTER TABLE gestion_location_mail_avis ADD CONSTRAINT gestion_location_mail_avis_sorte_check
  CHECK (sorte IN ('preavis_locataires', 'preavis_adhoc', 'sortie_adhoc', 'sortie_locataires',
    'previsite_alerte', 'previsite_invitation', 'previsite_reponse', 'previsite_locataires', 'previsite_locataires_modif',
    'previsite_invitation_cr', 'previsite_compte_rendu', 'previsite_refus', 'previsite_annulation',
    'sortie_edls_locataire', 'sortie_edls_proprietaire', 'sortie_edls_interne',
    'digicode_locataire', 'digicode_proprietaire', 'digicode_gestion',
    'edls_locataires', 'edls_locataires_modif', 'rdv_confirmation_interne', 'rdv_refus_interne'));

COMMENT ON TABLE gestion_rdv_jeton IS 'Liens personnels « J''accepte le rendez-vous » / « Je refuse » : un par locataire (occupation) et par créneau d''un rendez-vous (tâche) ; empreinte sha256 seule ; expire à l''heure du rendez-vous ; ajout seul (495).';
COMMENT ON TABLE gestion_rdv_reponse IS 'Journal des réponses des locataires aux rendez-vous, des validations à la main et de leur annulation, des mails internes partis ; par créneau (un déplacement rend les réponses d''avant caduques, jamais effacées) ; ajout seul (495).';
COMMENT ON COLUMN gestion_config.reponses_rdv_actives IS 'Réponses des locataires aux rendez-vous : boutons dans l''invitation de pré-visite et invitation des locataires à l''état des lieux. Éteint par défaut, jusqu''à validation des textes par Arno (495).';
