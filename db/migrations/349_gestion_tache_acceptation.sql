-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 349 — LOT TACHES-ACCEPTATION : LES DEMANDES D'ACCEPTATION DES TÂCHES CONFIÉES À UN COLLÈGUE, ET LEUR RÉGLAGE
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- DÉCISIONS D'ARNO (13/10/2026) :
--   · une tâche que je me confie est « Acceptée » d'office ; confiée à QUELQU'UN D'AUTRE, elle est « En attente
--     d'acceptation », et le destinataire reçoit un mail de demande (Accepter / Refuser) ;
--   · le lien n'agit que pour le bon destinataire, une seule fois, et expire ;
--   · « Refuser » exige un motif ; changer la date, l'heure ou la personne d'une tâche acceptée relance la demande ;
--   · l'envoi réel est COUPÉ par défaut, derrière le réglage « Envoyer les demandes d'acceptation par mail ».
--
-- 🔴 MIGRATION D'AJOUT, ET SEULEMENT D'AJOUT : deux tables neuves, leurs déclencheurs (fonction de refus de la 346)
-- et les lignes de départ de CES tables. Aucune table existante n'est modifiée ; aucune ligne existante n'est
-- touchée (les tâches existantes reçoivent leur demande dans la table NEUVE).
--
--   · `gestion_tache_reglage`  — une ligne : l'envoi des mails (FAUX par défaut) et la durée de validité des liens ;
--   · `gestion_tache_demande`  — une ligne par demande. La demande COURANTE d'une tâche est la seule non
--     « remplacée » ; renvoyer, réattribuer ou changer la date en pose une nouvelle et remplace l'ancienne, dont
--     le lien cesse aussitôt d'agir. Le JETON n'est jamais gardé en clair : seule son empreinte SHA-256 l'est.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS gestion_tache_reglage (
  id                      smallint    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  envoi_mail_acceptation  boolean     NOT NULL DEFAULT false,
  duree_lien_jours        integer     NOT NULL DEFAULT 7 CHECK (duree_lien_jours BETWEEN 1 AND 60),
  modifie_le              timestamptz NOT NULL DEFAULT now(),
  modifie_par_libelle     text        NOT NULL DEFAULT 'migration 349' CHECK (btrim(modifie_par_libelle) <> '')
);
INSERT INTO gestion_tache_reglage (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS gestion_tache_demande (
  id                    bigserial   PRIMARY KEY,
  tache_id              bigint      NOT NULL REFERENCES gestion_tache(id),
  destinataire_id       bigint      REFERENCES admin_utilisateur(id),
  destinataire_libelle  text        NOT NULL CHECK (btrim(destinataire_libelle) <> ''),
  destinataire_email    text,
  demandeur_id          bigint      REFERENCES admin_utilisateur(id),
  demandeur_libelle     text        NOT NULL CHECK (btrim(demandeur_libelle) <> ''),
  statut                text        NOT NULL CHECK (statut IN ('en_attente', 'acceptee', 'refusee', 'remplacee')),
  -- Vrai pour « Acceptée d'office » (tâche confiée à soi-même) et pour les tâches d'avant ce lot.
  automatique           boolean     NOT NULL DEFAULT false,
  jeton_empreinte       text        UNIQUE,
  expire_le             timestamptz,
  utilise_le            timestamptz,
  cree_le               timestamptz NOT NULL DEFAULT now(),
  repondu_le            timestamptz,
  repondu_par_libelle   text,
  motif                 text,
  remplacee_le          timestamptz,
  mail_etat             text        NOT NULL DEFAULT 'aucun'
                                    CHECK (mail_etat IN ('aucun', 'desactive', 'envoye', 'echec', 'factice')),
  mail_le               timestamptz,
  mail_erreur           text,
  gmail_message_id      text,
  CONSTRAINT gestion_tache_demande_refus_motif_chk CHECK (statut <> 'refusee' OR btrim(coalesce(motif, '')) <> '')
);

-- Une seule demande COURANTE par tâche.
CREATE UNIQUE INDEX IF NOT EXISTS gestion_tache_demande_courante_uq
  ON gestion_tache_demande (tache_id) WHERE statut <> 'remplacee';
CREATE INDEX IF NOT EXISTS gestion_tache_demande_destinataire_idx
  ON gestion_tache_demande (destinataire_id) WHERE statut <> 'remplacee';

DROP TRIGGER IF EXISTS gestion_tache_demande_no_delete ON gestion_tache_demande;
CREATE TRIGGER gestion_tache_demande_no_delete BEFORE DELETE ON gestion_tache_demande
  FOR EACH ROW EXECUTE FUNCTION gestion_tache_refuser_suppression();
DROP TRIGGER IF EXISTS gestion_tache_demande_no_truncate ON gestion_tache_demande;
CREATE TRIGGER gestion_tache_demande_no_truncate BEFORE TRUNCATE ON gestion_tache_demande
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_tache_refuser_suppression();

-- Les tâches EXISTANTES (décision d'Arno) : « Acceptée » si confiée à son créateur, sinon « En attente ». Aucun mail
--   n'est envoyé pour elles (mail « aucun ») ; « Renvoyer la demande » en enverra un si on le souhaite.
INSERT INTO gestion_tache_demande (tache_id, destinataire_id, destinataire_libelle, destinataire_email, demandeur_id,
                                   demandeur_libelle, statut, automatique, repondu_le, repondu_par_libelle)
SELECT t.id, t.confiee_a, t.confiee_a_libelle, u.identifiant, t.cree_par, t.cree_par_libelle,
       CASE WHEN t.confiee_a IS NOT DISTINCT FROM t.cree_par THEN 'acceptee' ELSE 'en_attente' END,
       true,
       CASE WHEN t.confiee_a IS NOT DISTINCT FROM t.cree_par THEN t.cree_le END,
       CASE WHEN t.confiee_a IS NOT DISTINCT FROM t.cree_par THEN t.cree_par_libelle END
  FROM gestion_tache t
  LEFT JOIN admin_utilisateur u ON u.id = t.confiee_a
 WHERE NOT EXISTS (SELECT 1 FROM gestion_tache_demande d WHERE d.tache_id = t.id);

COMMIT;
