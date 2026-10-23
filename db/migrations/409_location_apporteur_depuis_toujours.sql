-- 409_location_apporteur_depuis_toujours.sql — LOCATION « OUTILS DE SUIVI » (Arno, 23/10/2026) : RATTACHEMENT « DEPUIS TOUJOURS ».
-- Suite de la 407 (qu'elle suppose appliquée).
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL (aucune ligne existante n'est modifiée ni supprimée) :
--   · la date d'effet d'un rattachement apporteur → collègue peut être VIDE : « depuis toujours ». L'apporteur est alors
--     rattaché à ce collègue pour TOUTES ses affaires, l'historique importé (2019 → 2026) compris, et les futures ;
--   · au plus UN « depuis toujours » par apporteur (index unique partiel). Un rattachement DATÉ ultérieur reste possible : il
--     prend le relais à sa date, le « depuis toujours » couvre tout ce qui précède.
-- IDEMPOTENTE (rejouable). Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction.

ALTER TABLE gestion_location_apporteur_collegue ALTER COLUMN depuis DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS gestion_location_apporteur_collegue_toujours_idx
  ON gestion_location_apporteur_collegue (apporteur_id) WHERE depuis IS NULL;

COMMENT ON COLUMN gestion_location_apporteur_collegue.depuis IS
  'Date d''effet du rattachement (407) ; NULL (409) : « depuis toujours » — tout l''historique et ce qui suit, jusqu''à un rattachement daté.';
