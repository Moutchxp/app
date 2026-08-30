-- 179_config_cascade_partielle.sql — CASC-3 : réglages de la CASCADE de relances sur DOSSIER PARTIEL (préparation seule, AUCUN envoi).
--
-- ⚠️ RÈGLE MÉTIER (Arno) : après la 1re réclamation de pièces manquantes, relancer la mairie tous les N jours (10), DEUX FOIS ; puis,
-- après un délai (10 j), annoncer qu'une saisine CADA sera engagée ; laisser un délai (4 j) avant que la saisine devienne proposable.
-- Ces réglages ne concernent QUE les demandes marquées « dossier partiel » (CASC-1). La cascade du 22/08 (absence TOTALE de réponse)
-- reste STRICTEMENT INCHANGÉE (aucune colonne existante touchée).
--
-- 🔴 GARDE : n'affecte NI le moteur SVAV, NI le verdict, NI le golden Asnières (29.107259068449615), NI les gardes ETAN-1, NI
--    `batiment`. AUCUN envoi. Quatre colonnes ADDITIVES sur config_veille (singleton id=1), avec CHECK de plage.
--
-- SÛR : ADD COLUMN IF NOT EXISTS uniquement. Aucun DROP, aucune écriture de données. GOLDEN-SAFE. Idempotente. Une transaction.
-- Requiert config_veille. Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/179_config_cascade_partielle.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS cascade_partiel_relance_jours integer NOT NULL DEFAULT 10
  CHECK (cascade_partiel_relance_jours BETWEEN 1 AND 90);   -- intervalle entre la 1re réclamation et chaque relance (défaut 10 j)
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS cascade_partiel_annonce_jours integer NOT NULL DEFAULT 10
  CHECK (cascade_partiel_annonce_jours BETWEEN 1 AND 90);   -- délai entre la dernière relance et l'annonce CADA (défaut 10 j)
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS cascade_partiel_saisine_jours integer NOT NULL DEFAULT 4
  CHECK (cascade_partiel_saisine_jours BETWEEN 0 AND 90);   -- délai entre l'annonce et la saisine (défaut 4 j) — harmonisé au butoir CASC-2 (max)
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS cascade_partiel_nb_relances integer NOT NULL DEFAULT 2
  CHECK (cascade_partiel_nb_relances BETWEEN 1 AND 10);     -- nombre de relances courtoises avant l'annonce (défaut 2)

COMMENT ON COLUMN config_veille.cascade_partiel_relance_jours IS
  'CASC-3 — cascade de relances sur dossier PARTIEL : intervalle (jours) entre la 1re réclamation et chaque relance. Avec nb_relances (2), annonce_jours (10) et saisine_jours (4) → défaut : relance 1 à J+10, relance 2 à J+20, annonce à J+30, saisine ≥ butoir CASC-2. Dossiers partiels UNIQUEMENT ; cascade sans réponse inchangée.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (LECTURE SEULE) :
\echo '>>> colonnes + valeurs par défaut :'
SELECT cascade_partiel_relance_jours, cascade_partiel_annonce_jours, cascade_partiel_saisine_jours, cascade_partiel_nb_relances FROM config_veille WHERE id = 1;

-- ═════════════════════════════════════════════════════════════════════════════
-- 🔙 ROLLBACK :
--   ALTER TABLE config_veille DROP COLUMN IF EXISTS cascade_partiel_relance_jours, DROP COLUMN IF EXISTS cascade_partiel_annonce_jours,
--     DROP COLUMN IF EXISTS cascade_partiel_saisine_jours, DROP COLUMN IF EXISTS cascade_partiel_nb_relances;
