-- 399_gestion_immeuble_digicode_batiment.sql — GESTION / LOCATION (Arno, 21/10/2026) : UN DIGICODE PAR BÂTIMENT.
--
-- LA RÈGLE (Arno, complète la 396) : une même adresse postale peut avoir un digicode DIFFÉRENT par bâtiment (A, B…). Le code
-- reste porté par l'IMMEUBLE (adresse normalisée), jamais par le syndic, et jamais copié dans les fiches de biens. Clé :
-- adresse normalisée + bâtiment normalisé (casse, accents, espaces, « Bât. B » = « B » = « bâtiment b »), calculé par
-- l'application (`cleBatiment` de `digicodeImmeuble.ts`). Bâtiment vide = le « code général » de l'adresse.
-- Un bien lit le code de SON bâtiment ; si ce bâtiment n'a pas de code, ou si le bien n'a pas de bâtiment, il lit le code
-- général de l'adresse.
--
-- CE QU'ELLE FAIT, ET RIEN D'AUTRE (ajouts) :
--   ① TABLE NEUVE `gestion_immeuble_batiment` : le digicode d'UN bâtiment d'un immeuble (`immeuble_id` + `batiment_cle`).
--     Ni DELETE ni TRUNCATE (même verrou que l'immeuble, migration 396) ;
--   ② le journal `gestion_immeuble_digicode_journal` reçoit DEUX colonnes facultatives : le bâtiment (clé et libellé) ;
--     vide = le code général. Les lignes déjà écrites restent telles quelles (elles portaient le code général) ;
--   ③ les digicodes déjà portés par un immeuble (`gestion_immeuble.digicode` / `digicode_code`) DEVIENNENT son « code général » :
--     aucune valeur n'est déplacée ni modifiée, seule leur description change.
-- AUCUNE ligne n'est supprimée ni modifiée.
--
-- IDEMPOTENTE (rejouable). Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction avec son inscription.
-- Requiert la 396 (table `gestion_immeuble` et fonction `gestion_immeuble_refuser`).

CREATE TABLE IF NOT EXISTS gestion_immeuble_batiment (
  id                   bigserial   PRIMARY KEY,
  immeuble_id          bigint      NOT NULL REFERENCES gestion_immeuble(id),
  batiment_cle         text        NOT NULL CHECK (btrim(batiment_cle) <> ''),
  batiment_libelle     text        NOT NULL CHECK (btrim(batiment_libelle) <> ''),
  digicode             boolean,
  digicode_code        text        CHECK (digicode_code IS NULL OR char_length(digicode_code) <= 8),
  cree_le              timestamptz NOT NULL DEFAULT now(),
  cree_par             bigint,
  cree_par_libelle     text        NOT NULL CHECK (btrim(cree_par_libelle) <> ''),
  modifie_le           timestamptz,
  modifie_par_libelle  text,
  CONSTRAINT gestion_immeuble_batiment_unique UNIQUE (immeuble_id, batiment_cle),
  CONSTRAINT gestion_immeuble_batiment_code_chk CHECK (digicode_code IS NULL OR digicode IS TRUE)
);

DROP TRIGGER IF EXISTS gestion_immeuble_batiment_no_delete ON gestion_immeuble_batiment;
CREATE TRIGGER gestion_immeuble_batiment_no_delete BEFORE DELETE ON gestion_immeuble_batiment
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_immeuble_refuser();
DROP TRIGGER IF EXISTS gestion_immeuble_batiment_no_truncate ON gestion_immeuble_batiment;
CREATE TRIGGER gestion_immeuble_batiment_no_truncate BEFORE TRUNCATE ON gestion_immeuble_batiment
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_immeuble_refuser();

ALTER TABLE gestion_immeuble_digicode_journal ADD COLUMN IF NOT EXISTS batiment_cle text;
ALTER TABLE gestion_immeuble_digicode_journal ADD COLUMN IF NOT EXISTS batiment_libelle text;

COMMENT ON TABLE gestion_immeuble_batiment IS 'Digicode d''UN bâtiment d''un immeuble (adresse normalisée + bâtiment normalisé), indépendant du syndic ; sans code, les biens du bâtiment lisent le code général de l''immeuble — migration 399.';
COMMENT ON COLUMN gestion_immeuble.digicode IS 'Le « code général » de l''adresse (migration 399) : lu par les biens sans bâtiment et par ceux dont le bâtiment n''a pas de code propre.';
COMMENT ON COLUMN gestion_immeuble.digicode_code IS 'Le code du « code général » de l''adresse (migration 399).';
COMMENT ON COLUMN gestion_immeuble_digicode_journal.batiment_cle IS 'Le bâtiment dont le digicode a changé (clé normalisée) ; vide = le code général de l''adresse — migration 399.';
COMMENT ON COLUMN gestion_immeuble_digicode_journal.batiment_libelle IS 'Le bâtiment tel qu''affiché (« B ») ; vide = le code général — migration 399.';
