-- 363_admin_invitation.sql — LOT GESTION-INVITATION-ADMIN (16/10/2026) : le mail d'invitation d'un nouveau compte.
--
-- POURQUOI : créer un compte (tuile Administratif) ne faisait partir AUCUN mail — le mot de passe temporaire était
-- affiché une fois à l'écran, à transmettre à la main. Arno : « le mail d'invitation doit partir à la création, avec un
-- lien d'activation valable ; si l'envoi échoue, l'écran doit le dire ; un bouton “Renvoyer le mail d'invitation” ».
--
-- UNE LIGNE PAR LIEN ENVOYÉ (jamais effacée) : le JETON n'existe en clair que dans le mail ; la base ne garde que son
-- empreinte SHA-256. Un lien agit UNE fois (`utilise_le`), avant `expire_le`, et cesse d'agir dès qu'un renvoi le
-- remplace (`remplacee_le`). `mail_etat` dit ce qui est réellement arrivé à l'envoi (pas de mensonge d'interface).
--
-- Table NEUVE et VIDE : rien ne change pour les comptes existants. Aucune donnée touchée. IDEMPOTENTE (IF NOT EXISTS).
-- Pas de BEGIN/COMMIT : la mise à jour de la prod l'enveloppe dans UNE transaction avec son inscription.

CREATE TABLE IF NOT EXISTS admin_invitation (
  id               bigserial   PRIMARY KEY,
  utilisateur_id   bigint      NOT NULL REFERENCES admin_utilisateur(id) ON DELETE CASCADE,
  jeton_empreinte  text        NOT NULL UNIQUE,                 -- SHA-256 hex du jeton (jamais le jeton)
  cree_le          timestamptz NOT NULL DEFAULT now(),
  expire_le        timestamptz NOT NULL,
  utilise_le       timestamptz,                                 -- lien utilisé (compte activé) : il n'agit plus
  remplacee_le     timestamptz,                                 -- remplacé par un renvoi : il n'agit plus
  envoye_par       bigint      REFERENCES admin_utilisateur(id) ON DELETE SET NULL,
  mail_etat        text        NOT NULL DEFAULT 'en_cours' CHECK (mail_etat IN ('en_cours', 'envoye', 'factice', 'echec')),
  mail_le          timestamptz,
  mail_erreur      text                                         -- motif réel d'un échec (jamais un secret)
);

CREATE INDEX IF NOT EXISTS admin_invitation_utilisateur_idx ON admin_invitation (utilisateur_id, cree_le DESC);

COMMENT ON TABLE admin_invitation IS 'Liens d''activation des comptes d''administration (lot GESTION-INVITATION-ADMIN, 16/10/2026). Empreinte du jeton seulement ; usage unique ; expiration ; remplacé par un renvoi.';
