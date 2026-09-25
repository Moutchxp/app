-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- MIGRATION 248 — LOT 5-PJ-D : COMBIEN DE DOSSIERS RÉCENTS LE SÉLECTEUR PROPOSE À L'OUVERTURE.
--
-- CE QU'ELLE FAIT, ET RIEN DE PLUS : un réglage, `gestion_config.drive_dossiers_recents_max`, par défaut 6. C'est le
-- chiffre demandé par Arno le 25/09/2026 (« les 6 derniers dossiers alimentés depuis la boîte mail »), et c'est
-- précisément pour cela qu'il est en base et non dans le code : six est un CHOIX d'aujourd'hui, pas une vérité.
-- Le changer ne demande ni développeur, ni redéploiement :
--   UPDATE gestion_config SET drive_dossiers_recents_max = 8 WHERE id = 1;
--
-- 🔴 ELLE NE CONDITIONNE AUCUNE FONCTIONNALITÉ. Tant qu'elle n'est pas appliquée, la vue d'ouverture propose SIX
-- dossiers — exactement la valeur par défaut de la colonne. Le code la sonde avant de la nommer (`schema.ts`,
-- sonde HORS transaction), et retombe sur 6 sans un mot d'erreur.
--
-- ⚠️ POURQUOI CE RÉGLAGE EST LU À PART, et surtout PAS ajouté au SELECT de `chargerConfigGestion` : ce SELECT-là
-- retombe sur un jeu de colonnes réduit dès qu'UNE colonne manque (erreur 42703). Y glisser une colonne non encore
-- créée ferait perdre, le temps que la migration soit appliquée, TOUS les réglages des migrations 230 à 241 —
-- intervalle de relève, fenêtre d'annulation, fenêtre d'activité. Une sonde isolée ne coûte qu'une question.
--
-- ⚠️ AUCUN INDEX N'EST CRÉÉ, et c'est délibéré. La liste des dossiers récents lit `gestion_piece_drive` en entier
-- (DISTINCT ON sur quelques dizaines à quelques centaines de lignes) : sur cette taille, le planificateur balaie la
-- table quoi qu'on pose, et un index qu'il n'emprunte jamais est une dette, pas une optimisation (cf. AGENTS.md,
-- « un index n'aide que si le planificateur le PREND »). À rouvrir le jour où la table dépassera quelques milliers
-- de lignes, EXPLAIN à l'appui, et pas avant.
--
-- BORNES : 1 à 20. En dessous de 1 la liste n'existe plus (autant retirer la vue) ; au-delà de 20, ce n'est plus un
-- raccourci mais un annuaire, et la racine du Drive fait déjà ce travail-là, en mieux.
--
-- POUR APPLIQUER :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/248_gestion_drive_dossiers_recents.sql
--
-- POUR REVENIR EN ARRIÈRE (le sélecteur reproposera 6 dossiers, rien d'autre ne change) :
--   ALTER TABLE gestion_config DROP COLUMN IF EXISTS drive_dossiers_recents_max;
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

-- La 245 d'abord : sans la mémoire des dépôts, il ne peut exister aucun « dossier récent » à compter. Le dire
--   clairement vaut mieux que de laisser une colonne réglant une liste qui ne peut pas exister.
DO $$
BEGIN
  IF to_regclass('public.gestion_piece_drive') IS NULL THEN
    RAISE EXCEPTION 'La migration 245 (mémoire des dépôts Drive) doit être appliquée AVANT celle-ci.';
  END IF;
END $$;

ALTER TABLE gestion_config
  ADD COLUMN IF NOT EXISTS drive_dossiers_recents_max int NOT NULL DEFAULT 6;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_config_dossiers_recents_chk') THEN
    ALTER TABLE gestion_config
      ADD CONSTRAINT gestion_config_dossiers_recents_chk
      CHECK (drive_dossiers_recents_max BETWEEN 1 AND 20);
  END IF;
END $$;

COMMENT ON COLUMN gestion_config.drive_dossiers_recents_max IS
  'LOT 5-PJ-D — combien de dossiers RÉCENTS le sélecteur Drive propose à l''ouverture (défaut 6, bornes 1 à 20). '
  'La liste est DÉRIVÉE de gestion_piece_drive : un dossier y figure parce qu''un dépôt y a réussi, jamais parce '
  'que quelqu''un l''a inscrit quelque part. Les droits, eux, sont vérifiés dossier par dossier au moment de '
  'l''affichage, avec le jeton de la personne connectée : cette table ne décide de rien d''autre que du NOMBRE.';

COMMIT;
