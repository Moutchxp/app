-- 416_admin_reinitialisation_mot_de_passe.sql — « MOT DE PASSE OUBLIÉ » DE L'ADMINISTRATION (Arno, 24/10/2026).
--
-- POURQUOI : la page de connexion de l'administration (/admin/login) n'avait aucun « Mot de passe oublié ? ». Il n'en a jamais
-- existé (hors périmètre de la spécification du 09/07/2026) ; celui de l'espace CLIENT (migration 046) est intact. On le construit
-- sur le modèle exact du client et des invitations de compte (migration 363).
--
-- CE QU'ELLE CRÉE, ET RIEN D'AUTRE (ajout seul) :
--   · `admin_reinitialisation` — UNE LIGNE PAR LIEN ENVOYÉ (jamais effacée, comme les invitations) : le JETON n'existe en clair
--     que dans le mail ; la base ne garde que son empreinte SHA-256. Un lien agit UNE fois (`utilise_le`), pendant une heure
--     (`expire_le`), et cesse d'agir dès qu'une nouvelle demande le remplace (`remplacee_le`). `mail_etat` dit ce qui est
--     réellement arrivé à l'envoi ;
--   · `admin_reinitialisation_demande` — le compteur des DEMANDES (anti-rafale), clé = empreinte SHA-256 de l'adresse saisie
--     (jamais l'adresse en clair), compté AVANT de savoir si un compte existe.
-- Tables NEUVES et VIDES : rien ne change pour les comptes existants. IDEMPOTENTE (IF NOT EXISTS). Pas de BEGIN/COMMIT : la mise à
-- jour l'enveloppe dans UNE transaction avec son inscription.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, la demande répond le même message et n'envoie rien (journalisé côté
-- serveur, sans adresse), et le lien répond « Ce lien n'est plus valide ».

CREATE TABLE IF NOT EXISTS admin_reinitialisation (
  id               bigserial   PRIMARY KEY,
  utilisateur_id   bigint      NOT NULL REFERENCES admin_utilisateur(id) ON DELETE CASCADE,
  jeton_empreinte  text        NOT NULL UNIQUE,                 -- SHA-256 hex du jeton (jamais le jeton)
  cree_le          timestamptz NOT NULL DEFAULT now(),
  expire_le        timestamptz NOT NULL,
  utilise_le       timestamptz,                                 -- lien utilisé (mot de passe choisi) : il n'agit plus
  remplacee_le     timestamptz,                                 -- remplacé par une nouvelle demande : il n'agit plus
  mail_etat        text        NOT NULL DEFAULT 'en_cours' CHECK (mail_etat IN ('en_cours', 'envoye', 'factice', 'echec')),
  mail_le          timestamptz,
  mail_erreur      text                                         -- motif réel d'un échec (jamais un secret)
);
CREATE INDEX IF NOT EXISTS admin_reinitialisation_utilisateur_idx ON admin_reinitialisation (utilisateur_id, cree_le DESC);

CREATE TABLE IF NOT EXISTS admin_reinitialisation_demande (
  id          bigserial   PRIMARY KEY,
  cle_hachee  text        NOT NULL,                             -- SHA-256 hex de « admin-reset: » + adresse normalisée
  ts          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_reinitialisation_demande_cle_idx ON admin_reinitialisation_demande (cle_hachee, ts DESC);

COMMENT ON TABLE admin_reinitialisation IS 'Liens « mot de passe oublié » des comptes d''administration (Arno, 24/10/2026). Empreinte du jeton seulement ; usage unique ; 1 heure ; remplacé par une nouvelle demande.';
COMMENT ON TABLE admin_reinitialisation_demande IS 'Demandes « mot de passe oublié » de l''administration, par empreinte d''adresse (anti-rafale).';
