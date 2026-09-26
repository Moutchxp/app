-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- MIGRATION 259 — LOT COPIE-SURV : POURQUOI UNE PIÈCE N'A PAS PU ÊTRE COPIÉE.
--
-- ═══ 🔴 LE DÉFAUT DE DISPOSITIF QUE CETTE TABLE RÉPARE ══════════════════════════════════════════════════════════
-- Le 26/09/2026, la passe n° 4 s'est arrêtée sur « 10 échecs d'affilée » après avoir copié 2 199 pièces. Les onze
-- motifs, eux, n'existaient QUE dans `~/Desktop/copie-pieces.log` — et la relance du soir, écrite avec `>`, a
-- écrasé ce fichier. Le diagnostic a dû se reconstituer par déduction : l'heure de la dernière réussie, les pièces
-- que la passe suivante a copiées sans peine, l'absence de veille du Mac. La cause était pourtant NOMMÉE par le
-- code lui-même — `motif()` rend « La connexion Google a expiré » sur un 401 — mais cette phrase était dans le
-- fichier effacé.
--
-- Un motif d'échec est une PIÈCE DE PREUVE. Il n'a rien à faire dans un fichier qu'une redirection peut vider.
--
-- ═══ CE QUE LA TABLE PORTE, ET POURQUOI CHAQUE COLONNE ═════════════════════════════════════════════════════════
--   · `passe_id`  — de quelle passe il s'agit, donc quelle nuit, quel code, quel jeton ;
--   · `piece_id`  — la pièce concernée. NULLABLE : un échec de jeton ou de dossier ne porte sur aucune pièce ;
--   · `etape`     — OÙ ça a cassé. C'est ce qui distingue « Google a refusé » de « MinIO est illisible » ;
--   · `code_http` — le statut rendu par Google, CAPTÉ À LA SOURCE et jamais relu dans le texte du motif ;
--   · `refuse`    — le garde-fou a dit non. Ce n'est pas un échec ordinaire, c'est une ANOMALIE à instruire ;
--   · `rang`      — le rang de l'échec dans la série consécutive. Dix, c'est l'arrêt : on voit la série monter.
--
-- 🔴 AJOUT SEUL, TENU PAR UN TRIGGER. Une ligne d'échec ne se corrige pas et ne s'efface pas : c'est précisément sa
-- valeur. `TRUNCATE` est refusé aussi — la garantie vaudrait peu si on pouvait vider la table d'un mot.
--
-- ⚠️ SANS CETTE MIGRATION, LA COPIE TOURNE EXACTEMENT COMME AVANT. La sonde `copieEchecsDisponibles` est consultée
-- avant chaque écriture ; absente, les motifs continuent d'aller au terminal, et rien d'autre ne change. C'est
-- indispensable ici : une passe de copie est en cours au moment où ce lot est livré, elle porte l'ancien code, et
-- elle ne doit être gênée d'aucune façon.
--
-- 🔒 AUCUNE DONNÉE PERSONNELLE : elle crée une table vide. Un motif d'échec porte un code HTTP et une phrase de
-- Google — jamais le contenu d'une pièce, jamais une adresse.
--
-- POUR APPLIQUER :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/259_gestion_copie_echec.sql
--
-- POUR REVENIR EN ARRIÈRE (la copie continue ; les motifs retournent au seul terminal) :
--   DROP TABLE IF EXISTS gestion_drive_copie_echec;
--   DROP FUNCTION IF EXISTS gestion_drive_copie_echec_append_only();
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.gestion_drive_copie_passe') IS NULL THEN
    RAISE EXCEPTION 'La migration 255 (passes de copie) doit être appliquée AVANT celle-ci.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS gestion_drive_copie_echec (
  id         bigserial   PRIMARY KEY,
  passe_id   bigint      NOT NULL REFERENCES gestion_drive_copie_passe(id) ON DELETE CASCADE,
  -- NULL = l'échec ne portait pas sur une pièce précise (jeton indisponible, dossier d'arrivée introuvable).
  piece_id   bigint      REFERENCES gestion_piece(id) ON DELETE SET NULL,
  survenu_le timestamptz NOT NULL DEFAULT now(),
  etape      text        NOT NULL,
  -- Le statut HTTP quand Google a répondu ; NULL quand la panne est ailleurs (garde-fou, stockage, réseau).
  code_http  integer,
  motif      text        NOT NULL,
  -- 🔴 Le garde-fou a refusé l'écriture. Une passe s'arrête IMMÉDIATEMENT là-dessus, sans attendre dix échecs :
  --   ce n'est pas une panne passagère, c'est une tentative d'écrire où il ne faut pas.
  refuse     boolean     NOT NULL DEFAULT false,
  -- Le rang dans la série d'échecs CONSÉCUTIFS. À dix, la passe s'arrête — on voit donc la série monter.
  rang       integer     NOT NULL DEFAULT 1,
  CONSTRAINT gestion_drive_copie_echec_etape_chk
    CHECK (etape IN ('jeton', 'dossier', 'stockage', 'envoi', 'verification', 'corbeille')),
  CONSTRAINT gestion_drive_copie_echec_motif_chk CHECK (btrim(motif) <> ''),
  CONSTRAINT gestion_drive_copie_echec_code_chk
    CHECK (code_http IS NULL OR (code_http BETWEEN 100 AND 599))
);

-- « Les derniers motifs de CETTE passe » : la question de `gestion:drive:copie-etat`.
CREATE INDEX IF NOT EXISTS gestion_drive_copie_echec_passe_idx
  ON gestion_drive_copie_echec (passe_id, survenu_le DESC);
-- « Les derniers motifs, toutes passes confondues » : la question du bandeau d'alerte.
CREATE INDEX IF NOT EXISTS gestion_drive_copie_echec_date_idx
  ON gestion_drive_copie_echec (survenu_le DESC);

-- ── AJOUT SEUL, TENU EN BASE ────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION gestion_drive_copie_echec_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'gestion_drive_copie_echec est APPEND-ONLY (pièce de preuve) : % interdit.', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
DROP TRIGGER IF EXISTS gestion_drive_copie_echec_no_update_delete ON gestion_drive_copie_echec;
CREATE TRIGGER gestion_drive_copie_echec_no_update_delete
  BEFORE UPDATE OR DELETE ON gestion_drive_copie_echec
  FOR EACH ROW EXECUTE FUNCTION gestion_drive_copie_echec_append_only();
DROP TRIGGER IF EXISTS gestion_drive_copie_echec_no_truncate ON gestion_drive_copie_echec;
CREATE TRIGGER gestion_drive_copie_echec_no_truncate
  BEFORE TRUNCATE ON gestion_drive_copie_echec
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_drive_copie_echec_append_only();

COMMENT ON TABLE gestion_drive_copie_echec IS
  'LOT COPIE-SURV — un motif d''échec de copie par ligne, avec son étape et son code HTTP. Née du 26/09/2026 : les '
  'onze motifs qui expliquaient l''arrêt de la passe n° 4 ont été perdus avec un fichier de journal écrasé par une '
  'redirection. Append-only : une pièce de preuve ne se corrige pas.';
COMMENT ON COLUMN gestion_drive_copie_echec.code_http IS
  'Statut rendu par Google, capté à la source dans la réponse — jamais relu dans le texte du motif, qui changerait '
  'sans que le chiffre suive.';
COMMENT ON COLUMN gestion_drive_copie_echec.rang IS
  'Rang dans la série d''échecs CONSÉCUTIFS (la passe s''arrête au dixième). Une série qui monte se lit donc en base.';

COMMIT;
