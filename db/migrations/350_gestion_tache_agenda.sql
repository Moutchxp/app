-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 350 — LOT TACHES-AGENDA (lot 2) : L'ENVOI DES TÂCHES DANS L'AGENDA GOOGLE DE LA PERSONNE CONCERNÉE
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- RÈGLE D'ARNO (13/10/2026) :
--   · confiée À SOI-MÊME : dans son agenda Google dès la création ;
--   · confiée à un COLLÈGUE : dans son agenda SEULEMENT après son acceptation (rien tant qu'elle est en attente ou
--     refusée) ;
--   · comptes de notre Workspace seulement ; sinon « pas d'agenda Google », la tâche reste dans l'application ;
--   · l'envoi réel est COUPÉ par défaut, derrière le réglage « Envoyer les tâches dans l'agenda Google ».
--
-- 🔴 MIGRATION D'AJOUT, ET SEULEMENT D'AJOUT :
--   · `gestion_tache` reçoit quatre colonnes NEUVES (durée d'un rendez-vous, compteur d'essais, prochain essai,
--     version de la demande de synchronisation). Aucune colonne existante n'est modifiée ; aucune ligne n'est
--     réécrite (les valeurs par défaut sont posées par PostgreSQL sans réécrire la table) ;
--   · `gestion_tache_reglage` reçoit une colonne NEUVE `envoi_agenda`, FAUSSE par défaut ;
--   · une table NEUVE `gestion_tache_agenda_appel` : le journal de CHAQUE appel à l'agenda (qui, quoi, quel
--     événement, résultat). Ni modifiable, ni supprimable (déclencheurs de la 346).
-- Les colonnes `google_agenda`, `google_evenement_id`, `synchro_*` préparées par la 346 servent enfin ; elles ne
-- changent pas de forme.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- La durée d'un rendez-vous, en minutes. NULL = 1 h (défaut d'Arno). Sans objet pour un repère sur la journée.
ALTER TABLE gestion_tache ADD COLUMN IF NOT EXISTS duree_minutes integer
  CHECK (duree_minutes IS NULL OR duree_minutes BETWEEN 5 AND 1440);
-- Les essais d'envoi vers l'agenda : combien d'échecs de suite, et quand réessayer.
ALTER TABLE gestion_tache ADD COLUMN IF NOT EXISTS synchro_essais integer NOT NULL DEFAULT 0;
ALTER TABLE gestion_tache ADD COLUMN IF NOT EXISTS synchro_prochain_essai timestamptz;
-- Chaque geste qui demande une synchronisation l'incrémente : une synchronisation commencée AVANT un nouveau geste
--   ne peut pas se déclarer « à jour » (elle repasse « à envoyer »).
ALTER TABLE gestion_tache ADD COLUMN IF NOT EXISTS synchro_version bigint NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS gestion_tache_synchro_idx ON gestion_tache (synchro_prochain_essai)
  WHERE synchro_etat IN ('a_envoyer', 'echec');

-- 🔴 L'ENVOI VERS L'AGENDA EST COUPÉ PAR DÉFAUT.
ALTER TABLE gestion_tache_reglage ADD COLUMN IF NOT EXISTS envoi_agenda boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS gestion_tache_agenda_appel (
  id               bigserial   PRIMARY KEY,
  tache_id         bigint      NOT NULL REFERENCES gestion_tache(id),
  operation        text        NOT NULL CHECK (operation IN ('creation', 'modification', 'suppression', 'recherche', 'verification')),
  agenda           text        NOT NULL,
  evenement_id     text,
  resultat         text        NOT NULL CHECK (resultat IN ('ok', 'absent', 'refus_garde', 'echec')),
  detail           text,
  survenu_le       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gestion_tache_agenda_appel_tache_idx ON gestion_tache_agenda_appel (tache_id, survenu_le);

DROP TRIGGER IF EXISTS gestion_tache_agenda_appel_no_update_delete ON gestion_tache_agenda_appel;
CREATE TRIGGER gestion_tache_agenda_appel_no_update_delete BEFORE UPDATE OR DELETE ON gestion_tache_agenda_appel
  FOR EACH ROW EXECUTE FUNCTION gestion_tache_action_inalterable();
DROP TRIGGER IF EXISTS gestion_tache_agenda_appel_no_truncate ON gestion_tache_agenda_appel;
CREATE TRIGGER gestion_tache_agenda_appel_no_truncate BEFORE TRUNCATE ON gestion_tache_agenda_appel
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_tache_action_inalterable();

COMMIT;
