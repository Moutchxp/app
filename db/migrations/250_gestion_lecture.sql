-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- MIGRATION 250 — LOT 5-BOITE : LU / NON LU, PAR COLLABORATEUR ET PAR MESSAGE.
--
-- CE QUE CE N'EST PAS. Ce n'est PAS « à traiter / traité », qui existe déjà et ne change pas : celui-là dit où en est
-- le TRAVAIL, il est commun à l'équipe, et il se décide. Le lu/non lu dit seulement « moi, je l'ai ouvert » : il est
-- PERSONNEL, il n'engage personne d'autre, et il ne se discute pas. Les mélanger ferait qu'ouvrir un mail aurait
-- l'air de traiter un dossier.
--
-- 🔴 PAR COLLABORATEUR, ET C'EST TOUT L'INTÉRÊT. Un message lu par Arnaud reste NON LU pour un collègue : sans cela,
-- le premier qui ouvre la boîte éteindrait le gras pour tout le monde, et plus personne ne saurait ce qu'il a vu.
--
-- 🔴 L'HISTORIQUE EST RÉPUTÉ LU, PAR UN REPÈRE ET NON PAR UNE ÉCRITURE DE MASSE. `lecture_service_le` retient
-- l'instant de mise en service ; tout message reçu AVANT est lu d'office, pour tout le monde, sans qu'une seule ligne
-- ne soit écrite. Écrire 16 800 lignes × N collaborateurs à l'application de cette migration aurait le même effet
-- visible, coûterait une table de plusieurs centaines de milliers de lignes, et surtout serait FAUX le jour où l'on
-- ajouterait un collaborateur — lui verrait d'un coup tout l'historique en gras.
--
-- 🔴 RIEN N'EST JAMAIS SUPPRIMÉ, y compris ici : « marquer comme non lu » n'efface pas la ligne, il écrit `lu = false`.
-- C'est ce qui rend le geste réversible ET l'historique lisible (`maj_le` dit quand on a changé d'avis), et c'est
-- aussi ce qui permet de marquer non lu un message ANTÉRIEUR à la mise en service : la ligne explicite l'emporte
-- toujours sur le repère. La règle complète tient en une phrase :
--     non lu  =  sens 'recu'  ET  ( ligne explicite ? NON lu : recu_le >= lecture_service_le )
--
-- ⚠️ CE QUI N'EST PAS JOURNALISÉ, ET POURQUOI. `gestion_journal` garde les GESTES MÉTIER — classer, détacher,
-- envoyer, déposer. Ouvrir un mail n'en est pas un : le journaliser ajouterait des dizaines de lignes par jour et par
-- personne, et noierait précisément ce que le journal existe pour rendre retrouvable. La table ci-dessous porte
-- elle-même sa trace (`maj_le`), ce qui suffit à cette information-là.
--
-- ⚠️ LA BOÎTE GMAIL N'EST PAS TOUCHÉE. Aucun drapeau `\Seen` n'est posé ni même lu : la relève ouvre le dossier en
-- lecture stricte (EXAMINE) et ce lot ne change rien à cela. Le lu/non lu vit CHEZ NOUS, pour NOS collaborateurs.
--
-- INDEX. Deux, et pas un de plus :
--   · la clé primaire (message_id, utilisateur_id) sert la question posée pour chaque message affiché ;
--   · (utilisateur_id, message_id) sert le compteur « non lus », qui parcourt ce qu'UNE personne a marqué.
-- Aucun index n'est ajouté sur `gestion_message` : le balayage du compteur est borné par `recu_le >= service`, que
-- `gestion_message_recu_idx (recu_le DESC)` sert déjà. Poser un index qu'un planificateur n'emprunte pas est une
-- dette, pas une optimisation (cf. AGENTS.md).
--
-- POUR APPLIQUER :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/250_gestion_lecture.sql
--
-- POUR REVENIR EN ARRIÈRE (plus rien n'est en gras, aucun menu lu/non lu ; rien d'autre ne change) :
--   DROP TABLE IF EXISTS gestion_message_lu;
--   ALTER TABLE gestion_config DROP COLUMN IF EXISTS lecture_service_le;
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.gestion_message') IS NULL THEN
    RAISE EXCEPTION 'La migration 228 (schéma du module Gestion) doit être appliquée AVANT celle-ci.';
  END IF;
END $$;

-- ── L'ÉTAT DE LECTURE, PERSONNEL ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gestion_message_lu (
  message_id     bigint      NOT NULL REFERENCES gestion_message(id),
  -- ON DELETE CASCADE, ici et seulement ici : l'état de lecture est une donnée PERSONNELLE. Purger un compte doit
  --   emporter ce qu'il a lu — le garder n'aurait aucun usage et serait une trace de plus sur quelqu'un qui est parti.
  utilisateur_id bigint      NOT NULL REFERENCES admin_utilisateur(id) ON DELETE CASCADE,
  -- `false` est une valeur AUSSI utile que `true` : c'est « marqué comme non lu », qui doit l'emporter sur le repère
  --   d'historique. D'où une colonne, et non l'absence de ligne.
  lu             boolean     NOT NULL,
  maj_le         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, utilisateur_id)
);

-- Le compteur « non lus » parcourt ce qu'UNE personne a marqué : c'est son sens de lecture à elle qu'il faut servir.
CREATE INDEX IF NOT EXISTS gestion_message_lu_utilisateur_idx
  ON gestion_message_lu (utilisateur_id, message_id);

COMMENT ON TABLE gestion_message_lu IS
  'LOT 5-BOITE — « j''ai ouvert ce message », PAR COLLABORATEUR. À ne pas confondre avec « à traiter / traité », qui '
  'dit où en est le TRAVAIL et qui, lui, est commun à l''équipe. Un message lu par l''un reste non lu pour l''autre. '
  'Une ligne lu = false est un « marquer comme non lu » EXPLICITE : elle l''emporte sur le repère d''historique.';
COMMENT ON COLUMN gestion_message_lu.lu IS
  'true = ouvert par cette personne ; false = elle l''a explicitement remis en non lu. L''absence de ligne renvoie au '
  'repère gestion_config.lecture_service_le — rien n''est jamais supprimé pour revenir en arrière.';

-- ── LE REPÈRE D'HISTORIQUE ──────────────────────────────────────────────────────────────────────────────────────
-- `DEFAULT now()` : la valeur est posée À L'APPLICATION de cette migration, ce qui est exactement la définition de
--   « mise en service ». Tout ce qui est arrivé avant est lu ; le gras ne commence qu'avec le courrier suivant.
ALTER TABLE gestion_config
  ADD COLUMN IF NOT EXISTS lecture_service_le timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN gestion_config.lecture_service_le IS
  'LOT 5-BOITE — instant de mise en service du lu/non lu. Tout message reçu AVANT est réputé LU par tout le monde, '
  'sans qu''aucune ligne ne soit écrite : c''est ce qui évite 16 800 messages en gras le jour de la livraison, et ce '
  'qui évite qu''un collaborateur ajouté plus tard hérite de tout l''historique en non lu.';

COMMIT;
