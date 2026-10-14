-- 352_config_scoring_reentree_tolerance_contact.sql
-- Décision d'Arno du 14/10/2026 (lot « FAISCEAU QUI LONGE SON PROPRE MUR », option A) : le propre bâtiment bouche un
-- faisceau LÀ OÙ il y entre réellement ; le contact RASANT le long de son mur ne compte jamais.
--
-- Nouveau réglage du moteur (SCORE seul, jamais le verdict) : `reentree_tolerance_contact_m`, en mètres. Le polygone du
-- propre bâtiment est rétréci de cette tolérance pour le seul calcul de la réentrée (`candidatReentreeOrigine`,
-- app/lib/db/obstacles.ts). Défaut 0,01 m ; plage [0,001 ; 0,10] (validés par Arno). Ce n'est pas un arrondi : aucune
-- coordonnée n'est tronquée.
--
-- Tant que cette migration n'est pas appliquée, le code tourne sur le schéma actuel avec le repli 0,01 m
-- (app/lib/db/toleranceReentree.ts) : appliquer la migration avec sa valeur par défaut NE CHANGE donc AUCUN score.
--
-- ⚠️ `config_scoring` passe de 39 à 40 colonnes : l'écran Pilotage (mappingConfig.ts, liste figée de 39) n'affichera pas ce
-- réglage tant qu'un lot dédié ne l'y ajoute pas ; `api/admin/config` le renverra (SELECT *).
--
-- IDEMPOTENTE (ADD COLUMN IF NOT EXISTS ; contrainte posée seulement si absente). Aucune donnée existante modifiée.
-- NON APPLIQUÉE par le lot. Application manuelle :
--   psql "$DATABASE_URL" -f db/migrations/352_config_scoring_reentree_tolerance_contact.sql

ALTER TABLE config_scoring
  ADD COLUMN IF NOT EXISTS reentree_tolerance_contact_m double precision NOT NULL DEFAULT 0.01;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'config_scoring'::regclass AND conname = 'config_scoring_reentree_tolerance_contact_m_plage'
  ) THEN
    ALTER TABLE config_scoring
      ADD CONSTRAINT config_scoring_reentree_tolerance_contact_m_plage
      CHECK (reentree_tolerance_contact_m >= 0.001 AND reentree_tolerance_contact_m <= 0.1);
  END IF;
END $$;

COMMENT ON COLUMN config_scoring.reentree_tolerance_contact_m IS
  'Tolérance de contact (m) de la réentrée dans le propre bâtiment : le contact rasant le long du mur ne compte jamais (décision Arno 14/10/2026). Défaut 0,01 ; plage [0,001 ; 0,10]. Score seul.';
