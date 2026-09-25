-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- MIGRATION 249 — LOT 5-VEILLE : AU BOUT DE COMBIEN DE TEMPS L'ÉCRAN DIT QUE LA RELÈVE AUTOMATIQUE EST ARRÊTÉE.
--
-- L'INCIDENT QUI L'A FAIT ÉCRIRE — 25/09/2026. Le rapatriement s'est terminé à 06:32, rien n'a pris le relais, et
-- pendant DIX HEURES aucun courrier n'est entré dans l'application. Le bandeau affichait pourtant, en gris,
-- « Dernière relève : 25 septembre 2026, 06:32 (il y a 9 h) » : exact, et parfaitement inutile. Il manquait un SEUIL.
--
-- CE QUE CETTE COLONNE EST : le seuil, exprimé en INTERVALLES de relève et non en minutes. `veille_releve_intervalles`
-- vaut 10 par défaut : avec la cadence d'une passe par minute (`releve_continue_secondes`), l'écran crie au bout de
-- dix minutes. Le jour où la cadence passera à 30 s, le seuil suivra tout seul — c'est exactement pour cela qu'il
-- compte des intervalles et pas des minutes. Deux réglages qui devraient bouger ensemble et qu'il faut penser à
-- déplacer tous les deux finissent toujours par se contredire.
--   UPDATE gestion_config SET veille_releve_intervalles = 5 WHERE id = 1;   -- plus nerveux
--
-- 🔴 ELLE NE CONDITIONNE AUCUNE FONCTIONNALITÉ. Tant qu'elle n'est pas appliquée, la tolérance vaut 10 intervalles —
-- exactement le défaut de la colonne. Le code la sonde avant de la nommer (`schema.ts`, sonde HORS transaction) et
-- retombe sur 10 sans un mot d'erreur. Le bandeau, lui, fonctionne dès maintenant.
--
-- ⚠️ ELLE EST LUE À PART, et surtout PAS ajoutée au SELECT de `chargerConfigGestion` : celui-ci retombe sur un jeu de
-- colonnes réduit dès qu'UNE colonne manque (erreur 42703). Y glisser une colonne non encore créée ferait perdre, le
-- temps que la migration soit appliquée, TOUS les réglages des migrations 230 à 241 — y compris
-- `releve_continue_secondes`, c'est-à-dire l'étalon même de cette alerte. Le remède serait alors la maladie.
--
-- ⚠️ AUCUNE COLONNE N'EST AJOUTÉE À `gestion_releve_run`, et aucune ligne passée n'est réécrite. L'étiquette
-- « planifie » que les passes automatiques portent désormais était DÉJÀ acceptée par la contrainte d'origine
-- (`gestion_releve_run_declencheur_chk`, vérifiée en base le 25/09) : personne ne l'avait simplement jamais posée.
-- Les passes d'avant ce lot restent donc « manuel » — c'est la vérité de ce qu'on savait alors, et la réécrire
-- inventerait un passé.
--
-- BORNES : 2 à 500 intervalles. En deçà de 2, un tour un peu long ferait crier au loup — et une alerte qui se trompe
-- est une alerte qu'on apprend à ignorer, c'est-à-dire une alerte perdue.
--
-- POUR APPLIQUER :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/249_gestion_veille_releve.sql
--
-- POUR REVENIR EN ARRIÈRE (le bandeau reprend la tolérance de 10 intervalles, rien d'autre ne change) :
--   ALTER TABLE gestion_config DROP COLUMN IF EXISTS veille_releve_intervalles;
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.gestion_releve_run') IS NULL THEN
    RAISE EXCEPTION 'La migration 228 (schéma du module Gestion) doit être appliquée AVANT celle-ci.';
  END IF;
END $$;

ALTER TABLE gestion_config
  ADD COLUMN IF NOT EXISTS veille_releve_intervalles int NOT NULL DEFAULT 10;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_config_veille_intervalles_chk') THEN
    ALTER TABLE gestion_config
      ADD CONSTRAINT gestion_config_veille_intervalles_chk
      CHECK (veille_releve_intervalles BETWEEN 2 AND 500);
  END IF;
END $$;

COMMENT ON COLUMN gestion_config.veille_releve_intervalles IS
  'LOT 5-VEILLE — combien d''INTERVALLES de retard avant que l''écran n''annonce que la relève automatique est '
  'arrêtée (défaut 10, bornes 2 à 500). Le seuil réel vaut veille_releve_intervalles × releve_continue_secondes : '
  'compter en intervalles plutôt qu''en minutes garantit que changer la cadence déplace l''alerte du même coup. '
  'Le repère est la dernière passe declencheur = ''planifie'' de gestion_releve_run — JAMAIS le dernier message '
  'capturé : une boîte calme un dimanche ne doit déclencher aucune alerte.';

COMMIT;
