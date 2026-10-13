-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 346 — LOT TACHES-1 : LES TÂCHES À FAIRE RATTACHÉES À UN BIEN (application seule, aucun appel Google)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- DÉCISIONS D'ARNO (13/10/2026, après la recon `docs/RECON_TACHES_AGENDA.md`) :
--   · une tâche est rattachée à UN bien (lot de l'annuaire), datée, avec ou sans heure (avec heure = rendez-vous,
--     sans heure = repère sur la journée), confiée à un collaborateur ayant l'accès Gestion ;
--   · lien FACULTATIF vers un événement du bien ;
--   · rappels par défaut : rendez-vous = la veille + 1 h avant ; repère = le jour même à 9 h. Modifiables ;
--   · 🔴 JAMAIS DE SUPPRESSION : « faite par X le … », « décalée par X le … (ancienne → nouvelle date) »,
--     « annulée par X le … » restent tracés.
--
-- 🔴 MIGRATION D'AJOUT, ET SEULEMENT D'AJOUT : deux tables neuves, deux fonctions, des déclencheurs posés sur ces
-- deux tables seulement. Aucune ligne existante n'est lue, modifiée ni supprimée ; aucune autre table n'est touchée.
-- Les clés étrangères pointent VERS l'annuaire, les événements et les comptes, sans rien y changer.
--
--   · `gestion_tache`         — la tâche, dans son état COURANT. On ne la supprime jamais (déclencheur) ;
--   · `gestion_tache_action`  — la TRACE de chaque geste (création, modification, faite, décalage, annulation,
--                               réouverture), datée et signée. Ni modifiable, ni supprimable (déclencheur).
--
-- ⚠️ LE JOURNAL DE GESTION N'EST PAS ÉLARGI : sa liste d'entités est fermée par une contrainte, et l'élargir
-- modifierait une table existante. La trace des tâches vit donc dans sa propre table, avec le même verrou.
--
-- 🔵 PRÉPARÉ POUR LE LOT 2 (agenda Google), INERTE ICI : `google_agenda`, `google_evenement_id`, `synchro_*`.
-- Aucun code de ce lot ne les lit pour agir ; ils naissent à « non demandée ».
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS gestion_tache (
  id                   bigserial   PRIMARY KEY,
  lot_id               bigint      NOT NULL REFERENCES gestion_annuaire_lot(id),
  evenement_id         bigint      REFERENCES gestion_evenement(id),
  objet                text        NOT NULL CHECK (btrim(objet) <> '' AND length(objet) <= 300),
  note                 text        CHECK (note IS NULL OR length(note) <= 5000),
  -- Le JOUR civil (heure de Paris) ; l'heure est facultative : NULL = repère sur la journée.
  jour                 date        NOT NULL,
  heure                time,
  -- Les rappels, sous forme neutre (voir `app/lib/gestion/taches.ts`) : une liste, jamais NULL.
  rappels              jsonb       NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(rappels) = 'array'),
  etat                 text        NOT NULL DEFAULT 'a_faire' CHECK (etat IN ('a_faire', 'faite', 'annulee')),
  confiee_a            bigint      REFERENCES admin_utilisateur(id),
  confiee_a_libelle    text        NOT NULL CHECK (btrim(confiee_a_libelle) <> ''),
  cree_le              timestamptz NOT NULL DEFAULT now(),
  cree_par             bigint      REFERENCES admin_utilisateur(id),
  cree_par_libelle     text        NOT NULL CHECK (btrim(cree_par_libelle) <> ''),
  maj_le               timestamptz NOT NULL DEFAULT now(),
  faite_le             timestamptz,
  faite_par_libelle    text,
  annulee_le           timestamptz,
  annulee_par_libelle  text,
  -- 🔵 LOT 2 — préparés, inertes.
  google_agenda        text,
  google_evenement_id  text,
  synchro_etat         text        NOT NULL DEFAULT 'non_demandee'
                                   CHECK (synchro_etat IN ('non_demandee', 'a_envoyer', 'envoyee', 'echec', 'a_retirer', 'retiree')),
  synchro_le           timestamptz,
  synchro_erreur       text,
  CONSTRAINT gestion_tache_faite_chk   CHECK ((etat = 'faite')   = (faite_le IS NOT NULL)),
  CONSTRAINT gestion_tache_annulee_chk CHECK ((etat = 'annulee') = (annulee_le IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS gestion_tache_lot_idx      ON gestion_tache (lot_id, jour);
CREATE INDEX IF NOT EXISTS gestion_tache_a_faire_idx  ON gestion_tache (jour, heure) WHERE etat = 'a_faire';
CREATE INDEX IF NOT EXISTS gestion_tache_confiee_idx  ON gestion_tache (confiee_a) WHERE etat = 'a_faire';

CREATE TABLE IF NOT EXISTS gestion_tache_action (
  id              bigserial   PRIMARY KEY,
  tache_id        bigint      NOT NULL REFERENCES gestion_tache(id),
  action          text        NOT NULL
                              CHECK (action IN ('creation', 'modification', 'faite', 'decalage', 'annulation', 'reouverture')),
  -- Ce qui a changé : les champs touchés, AVANT et APRÈS. Pour un décalage : l'ancienne et la nouvelle date.
  avant           jsonb,
  apres           jsonb,
  survenu_le      timestamptz NOT NULL DEFAULT now(),
  auteur_id       bigint      REFERENCES admin_utilisateur(id),
  auteur_libelle  text        NOT NULL CHECK (btrim(auteur_libelle) <> '')
);

CREATE INDEX IF NOT EXISTS gestion_tache_action_tache_idx ON gestion_tache_action (tache_id, survenu_le);

-- 🔴 LA TÂCHE NE SE SUPPRIME PAS : on l'annule. Même règle que l'historique (339), même exception pour les bases
--   d'essai jetables (`svav_test%`, `gestion_jetable`), où les épreuves nettoient derrière elles.
CREATE OR REPLACE FUNCTION gestion_tache_refuser_suppression() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_database() = 'gestion_jetable' OR current_database() LIKE 'svav_test%' THEN
    RETURN CASE WHEN TG_LEVEL = 'ROW' THEN OLD ELSE NULL END;
  END IF;
  RAISE EXCEPTION 'Tâches : % interdit sur % (règle d''Arno, migration 346). Une tâche s''annule, elle ne se supprime jamais.', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

-- 🔴 LA TRACE NE SE RÉÉCRIT PAS NON PLUS : ni modification, ni suppression.
CREATE OR REPLACE FUNCTION gestion_tache_action_inalterable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_database() = 'gestion_jetable' OR current_database() LIKE 'svav_test%' THEN
    RETURN CASE WHEN TG_LEVEL = 'ROW' THEN (CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END) ELSE NULL END;
  END IF;
  RAISE EXCEPTION 'Tâches : % interdit sur % (règle d''Arno, migration 346). La trace d''une tâche ne se modifie pas.', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS gestion_tache_no_delete ON gestion_tache;
CREATE TRIGGER gestion_tache_no_delete BEFORE DELETE ON gestion_tache
  FOR EACH ROW EXECUTE FUNCTION gestion_tache_refuser_suppression();
DROP TRIGGER IF EXISTS gestion_tache_no_truncate ON gestion_tache;
CREATE TRIGGER gestion_tache_no_truncate BEFORE TRUNCATE ON gestion_tache
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_tache_refuser_suppression();

DROP TRIGGER IF EXISTS gestion_tache_action_no_update_delete ON gestion_tache_action;
CREATE TRIGGER gestion_tache_action_no_update_delete BEFORE UPDATE OR DELETE ON gestion_tache_action
  FOR EACH ROW EXECUTE FUNCTION gestion_tache_action_inalterable();
DROP TRIGGER IF EXISTS gestion_tache_action_no_truncate ON gestion_tache_action;
CREATE TRIGGER gestion_tache_action_no_truncate BEFORE TRUNCATE ON gestion_tache_action
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_tache_action_inalterable();

COMMIT;
