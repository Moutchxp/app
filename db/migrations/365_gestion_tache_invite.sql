-- 365_gestion_tache_invite.sql — LOT GESTION-INVITATIONS-TACHES (17/10/2026) : PLUSIEURS INVITÉS PAR TÂCHE.
--
-- DEMANDE D'ARNO : « une même tâche peut inviter PLUSIEURS de nos collaborateurs en même temps ; chaque invité a son propre
-- lien, sa propre réponse et son propre jeton à usage unique » ; « Changer le destinataire » d'un invité en attente ;
-- « Renvoyer l'invitation » (délai minimal de 2 minutes entre deux renvois au même invité).
--
-- CE QU'ELLE CRÉE :
--   · TABLE NEUVE `gestion_tache_invite` — un invité d'une tâche (un collaborateur). On ne la supprime jamais (déclencheurs
--     de la 346) : retirer un invité, ou changer son destinataire, marque la ligne retirée (`retire_le`, `retire_raison`,
--     `remplace_par` = l'invité qui prend sa place). Elle porte aussi l'événement d'agenda de CET invité (`google_agenda`,
--     `google_evenement_id`) : chaque invité qui accepte a la tâche dans SON agenda, une fois.
--   · DEUX COLONNES NEUVES, NULLES, sur `gestion_tache_demande` : `invite_id` (l'invité à qui la demande est adressée) et
--     `raison` (creation, ajout, relance, renvoi, destinataire_change — sert au délai entre deux renvois).
--   · L'UNICITÉ « une demande courante » passe de la TÂCHE à l'INVITÉ : l'index `gestion_tache_demande_courante_uq`
--     (une seule demande non remplacée par tâche) est remplacé par deux index partiels — une demande courante par invité,
--     et l'ancienne règle, intacte, pour les demandes sans invité. Aucune donnée n'est retirée.
--
-- LA REPRISE DE L'EXISTANT, SANS PERTE :
--   · chaque tâche reçoit UN invité : le destinataire de sa demande courante (à défaut, la personne « Confiée à »), avec
--     son adresse ; l'événement d'agenda déjà posé (`gestion_tache.google_*`) est recopié sur cet invité ;
--   · les demandes de cette tâche adressées à cette personne (la courante ET l'historique) reçoivent `invite_id`. La
--     ligne de la demande ne change pas autrement : son jeton (empreinte), son statut, son expiration restent les mêmes —
--     les invitations EN ATTENTE gardent un lien qui marche ;
--   · les demandes anciennes adressées à une AUTRE personne (avant une réattribution) restent sans invité, « remplacées ».
--   · `gestion_tache` n'est pas modifiée (ni colonne, ni ligne).
--
-- IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour de la prod l'enveloppe dans UNE transaction avec son inscription.

CREATE TABLE IF NOT EXISTS gestion_tache_invite (
  id                    bigserial   PRIMARY KEY,
  tache_id              bigint      NOT NULL REFERENCES gestion_tache(id),
  collaborateur_id      bigint      REFERENCES admin_utilisateur(id),
  libelle               text        NOT NULL CHECK (btrim(libelle) <> ''),
  email                 text,
  rang                  integer     NOT NULL DEFAULT 0,
  ajoute_le             timestamptz NOT NULL DEFAULT now(),
  ajoute_par_libelle    text        NOT NULL CHECK (btrim(ajoute_par_libelle) <> ''),
  retire_le             timestamptz,
  retire_par_libelle    text,
  retire_raison         text        CHECK (retire_raison IS NULL OR retire_raison IN ('retire', 'destinataire_change')),
  remplace_par          bigint      REFERENCES gestion_tache_invite(id),
  google_agenda         text,
  google_evenement_id   text,
  CONSTRAINT gestion_tache_invite_retire_chk CHECK ((retire_le IS NULL) = (retire_par_libelle IS NULL))
);

-- Un collaborateur n'est qu'une fois ACTIF parmi les invités d'une tâche (jamais deux invitations, jamais deux événements).
CREATE UNIQUE INDEX IF NOT EXISTS gestion_tache_invite_actif_uq
  ON gestion_tache_invite (tache_id, collaborateur_id) WHERE retire_le IS NULL;
CREATE INDEX IF NOT EXISTS gestion_tache_invite_tache_idx ON gestion_tache_invite (tache_id);

DROP TRIGGER IF EXISTS gestion_tache_invite_no_delete ON gestion_tache_invite;
CREATE TRIGGER gestion_tache_invite_no_delete BEFORE DELETE ON gestion_tache_invite
  FOR EACH ROW EXECUTE FUNCTION gestion_tache_refuser_suppression();
DROP TRIGGER IF EXISTS gestion_tache_invite_no_truncate ON gestion_tache_invite;
CREATE TRIGGER gestion_tache_invite_no_truncate BEFORE TRUNCATE ON gestion_tache_invite
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_tache_refuser_suppression();

ALTER TABLE gestion_tache_demande ADD COLUMN IF NOT EXISTS invite_id bigint REFERENCES gestion_tache_invite(id);
ALTER TABLE gestion_tache_demande ADD COLUMN IF NOT EXISTS raison text
  CONSTRAINT gestion_tache_demande_raison_check
  CHECK (raison IS NULL OR raison IN ('creation', 'ajout', 'relance', 'renvoi', 'destinataire_change'));

-- Une demande COURANTE par invité ; l'ancienne règle (une par tâche) reste vraie pour les demandes sans invité.
DROP INDEX IF EXISTS gestion_tache_demande_courante_uq;
CREATE UNIQUE INDEX IF NOT EXISTS gestion_tache_demande_invite_courante_uq
  ON gestion_tache_demande (invite_id) WHERE statut <> 'remplacee' AND invite_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS gestion_tache_demande_sans_invite_courante_uq
  ON gestion_tache_demande (tache_id) WHERE statut <> 'remplacee' AND invite_id IS NULL;
CREATE INDEX IF NOT EXISTS gestion_tache_demande_invite_idx ON gestion_tache_demande (invite_id);

-- REPRISE : un invité par tâche existante — le destinataire de la demande courante, à défaut la personne « Confiée à ».
INSERT INTO gestion_tache_invite (tache_id, collaborateur_id, libelle, email, rang, ajoute_le, ajoute_par_libelle,
                                  google_agenda, google_evenement_id)
SELECT t.id, coalesce(d.destinataire_id, t.confiee_a), coalesce(d.destinataire_libelle, t.confiee_a_libelle),
       coalesce(d.destinataire_email, u.identifiant), 0, coalesce(d.cree_le, t.cree_le), 'migration 365 (reprise)',
       t.google_agenda, t.google_evenement_id
  FROM gestion_tache t
  LEFT JOIN gestion_tache_demande d ON d.tache_id = t.id AND d.statut <> 'remplacee'
  LEFT JOIN admin_utilisateur u ON u.id = coalesce(d.destinataire_id, t.confiee_a)
 WHERE NOT EXISTS (SELECT 1 FROM gestion_tache_invite i WHERE i.tache_id = t.id);

UPDATE gestion_tache_demande d SET invite_id = i.id
  FROM gestion_tache_invite i
 WHERE d.invite_id IS NULL AND i.tache_id = d.tache_id AND i.retire_le IS NULL
   AND d.destinataire_id IS NOT DISTINCT FROM i.collaborateur_id;

COMMENT ON TABLE gestion_tache_invite IS 'Les invités d''une tâche (lot GESTION-INVITATIONS-TACHES, 17/10/2026) : un collaborateur, sa demande courante, son événement d''agenda. Jamais supprimé : retiré ou remplacé.';
COMMENT ON COLUMN gestion_tache_demande.invite_id IS 'L''invité à qui la demande est adressée (migration 365). NULL = demande d''avant la 365 adressée à une autre personne.';
COMMENT ON COLUMN gestion_tache_demande.raison IS 'Pourquoi la demande a été posée : creation, ajout, relance (date/heure changée), renvoi, destinataire_change.';
