-- 366_gestion_tache_evenement.sql — LOT GESTION-TACHES-EVENEMENTS (17/10/2026) : RATTACHER UNE TÂCHE À UN OU PLUSIEURS
-- ÉVÉNEMENTS EN COURS.
--
-- DEMANDE D'ARNO : « dans la fenêtre de création de la tâche ET après coup (depuis “Modifier”), le créateur peut
-- rattacher la tâche à un ou plusieurs événements EN COURS (sélecteur multiple). On peut aussi retirer un rattachement
-- (trace au journal, rien n'est supprimé physiquement). » Chaque événement rattaché montre la tâche dans sa frise (un
-- point rouge à la date de la mission).
--
-- CE QU'ELLE CRÉE, ET RIEN D'AUTRE :
--   · TABLE NEUVE `gestion_tache_evenement` — un rattachement (tâche, événement), daté et signé. Retirer un rattachement
--     le MARQUE (`retire_le`, `retire_par_libelle`) ; la ligne reste. Rattaché de nouveau, il reprend une ligne neuve ;
--   · un index unique partiel (un seul rattachement ACTIF par couple) et un index de lecture par événement ;
--   · les déclencheurs de la 346 : ni suppression, ni vidage.
-- AUCUNE donnée existante n'est lue ni modifiée ; aucune autre table n'est touchée. La colonne `gestion_tache.evenement_id`
-- (« Événement du bien lié », un seul) reste telle quelle.
--
-- IDEMPOTENTE. Pas de BEGIN/COMMIT : la mise à jour de la prod l'enveloppe dans UNE transaction avec son inscription.

CREATE TABLE IF NOT EXISTS gestion_tache_evenement (
  id                  bigserial   PRIMARY KEY,
  tache_id            bigint      NOT NULL REFERENCES gestion_tache(id),
  evenement_id        bigint      NOT NULL REFERENCES gestion_evenement(id),
  ajoute_le           timestamptz NOT NULL DEFAULT now(),
  ajoute_par          bigint      REFERENCES admin_utilisateur(id),
  ajoute_par_libelle  text        NOT NULL CHECK (btrim(ajoute_par_libelle) <> ''),
  retire_le           timestamptz,
  retire_par_libelle  text,
  CONSTRAINT gestion_tache_evenement_retire_chk CHECK ((retire_le IS NULL) = (retire_par_libelle IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS gestion_tache_evenement_actif_uq
  ON gestion_tache_evenement (tache_id, evenement_id) WHERE retire_le IS NULL;
CREATE INDEX IF NOT EXISTS gestion_tache_evenement_evenement_idx
  ON gestion_tache_evenement (evenement_id) WHERE retire_le IS NULL;

DROP TRIGGER IF EXISTS gestion_tache_evenement_no_delete ON gestion_tache_evenement;
CREATE TRIGGER gestion_tache_evenement_no_delete BEFORE DELETE ON gestion_tache_evenement
  FOR EACH ROW EXECUTE FUNCTION gestion_tache_refuser_suppression();
DROP TRIGGER IF EXISTS gestion_tache_evenement_no_truncate ON gestion_tache_evenement;
CREATE TRIGGER gestion_tache_evenement_no_truncate BEFORE TRUNCATE ON gestion_tache_evenement
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_tache_refuser_suppression();

COMMENT ON TABLE gestion_tache_evenement IS 'Les événements EN COURS auxquels une tâche est rattachée (lot GESTION-TACHES-EVENEMENTS, 17/10/2026). Jamais supprimé : retiré.';
