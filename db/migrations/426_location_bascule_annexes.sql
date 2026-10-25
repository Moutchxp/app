-- 426_location_bascule_annexes.sql — LOCATION (Arno, 25/10/2026) : LA DATE DE BASCULE DE LA RÈGLE DES ANNEXES.
--
-- DÉCISION D'ARNO : « 1 lot principal = 1 gestion ; une annexe (parking, cave, box…) ne compte jamais, même louée séparément » — mais
-- SEULEMENT pour les mouvements et locations datés du 25/10/2026 ou après. Avant : comptage et statuts EXACTEMENT comme aujourd'hui. La date
-- est un PARAMÈTRE (Paramètres Location, lecture seule à l'écran), pas une constante du code.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL : une table de paramètres datés `gestion_location_parametre_date` (une ligne par valeur posée, la plus
-- récente fait foi, jamais modifiée ni effacée), et sa première valeur : `bascule_annexes_gestion` = 2026-10-25.
-- IDEMPOTENTE (rejouable : la valeur n'est posée qu'une fois). Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, aucune bascule — les compteurs restent exactement ceux d'aujourd'hui.

CREATE TABLE IF NOT EXISTS gestion_location_parametre_date (
  id        bigserial PRIMARY KEY,
  cle       text NOT NULL CHECK (cle IN ('bascule_annexes_gestion')),
  valeur    date NOT NULL,
  pose_le   timestamptz NOT NULL DEFAULT now(),
  pose_par  text NOT NULL CHECK (btrim(pose_par) <> '')
);
CREATE INDEX IF NOT EXISTS gestion_location_parametre_date_cle ON gestion_location_parametre_date (cle, pose_le DESC, id DESC);

-- En ajout seul : ni modification ni effacement (la même garde que les réglages de la Location).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'gestion_location_parametre_date_ajout_seul') THEN
    CREATE TRIGGER gestion_location_parametre_date_ajout_seul BEFORE DELETE OR UPDATE ON gestion_location_parametre_date
      FOR EACH ROW EXECUTE FUNCTION gestion_ajout_seul_refuser();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'gestion_location_parametre_date_no_truncate') THEN
    CREATE TRIGGER gestion_location_parametre_date_no_truncate BEFORE TRUNCATE ON gestion_location_parametre_date
      FOR EACH STATEMENT EXECUTE FUNCTION gestion_ajout_seul_refuser();
  END IF;
END $$;

INSERT INTO gestion_location_parametre_date (cle, valeur, pose_par)
SELECT 'bascule_annexes_gestion', DATE '2026-10-25', 'migration 426 — décision d''Arno du 25/10/2026'
 WHERE NOT EXISTS (SELECT 1 FROM gestion_location_parametre_date WHERE cle = 'bascule_annexes_gestion');

COMMENT ON TABLE gestion_location_parametre_date IS
  'Paramètres datés de la Location (426), en ajout seul : la ligne la plus récente d''une clé fait foi. bascule_annexes_gestion : à partir de cette date, les annexes ne comptent plus comme des gestions.';
