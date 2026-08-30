-- 177_demande_dossier_partiel.sql — CASC-1 : marqueur « DOSSIER PARTIEL » sur une demande, pour SUSPENDRE la relance ordinaire quand
-- la mairie a déjà répondu PARTIELLEMENT et qu'Arno a réclamé les pièces manquantes (PART-3a/3c envoi, ou PART-3e déclaration).
--
-- ⚠️ POURQUOI : sans ce marqueur, le cycle de relance ordinaire (cascade du 22/08) continue et un courrier standard partirait EN
-- PARALLÈLE de la réclamation ciblée. Le marqueur est une DONNÉE EXPLICITE (jamais une règle déduite) portée par la demande.
--
-- ÉTAT « ACTIF » du marqueur = partiel_le IS NOT NULL AND partiel_leve_le IS NULL. Levée = auto (diagnostic « complet » pour TOUS les
-- permis de la demande) ou manuelle (Arno) → pose partiel_leve_le. Une nouvelle réclamation ré-arme (partiel_le=now, leve_le=NULL).
--
-- 🔴 GARDE : n'affecte NI le moteur SVAV, NI le verdict, NI le golden Asnières (29.107259068449615), NI config_scoring, NI les gardes
--    ETAN-1, NI `batiment`. AUCUN envoi. Ce lot NE DÉPLACE AUCUN PERMIS entre onglets. Colonnes ADDITIVES sur `demande`.
--
-- SÛR : ADD COLUMN IF NOT EXISTS uniquement. Aucun DROP, aucune écriture de données. GOLDEN-SAFE. Idempotente. Une transaction.
-- Requiert demande (053). Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/177_demande_dossier_partiel.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

ALTER TABLE demande ADD COLUMN IF NOT EXISTS partiel_le        timestamptz;                 -- date de la dernière réclamation de pièces (marqueur posé/ré-armé) ; NULL = jamais partiel
ALTER TABLE demande ADD COLUMN IF NOT EXISTS partiel_familles  text[];                      -- familles réclamées (masse/coupe/etage/cerfa)
ALTER TABLE demande ADD COLUMN IF NOT EXISTS partiel_origine   text
  CHECK (partiel_origine IS NULL OR partiel_origine IN ('outil','declaree'));               -- réclamation ENVOYÉE par l'outil, ou DÉCLARÉE hors outil
ALTER TABLE demande ADD COLUMN IF NOT EXISTS partiel_leve_le   timestamptz;                 -- levée du marqueur (auto « complet » ou manuelle) ; NULL = actif
ALTER TABLE demande ADD COLUMN IF NOT EXISTS partiel_leve_par  text;                        -- 'auto:complet' | 'admin:<id>' | motif libre

COMMENT ON COLUMN demande.partiel_le IS
  'CASC-1 — marqueur « dossier partiel » : date de la dernière réclamation de pièces. ACTIF ⇔ partiel_le IS NOT NULL AND partiel_leve_le IS NULL. Suspend la relance ordinaire (cascade 22/08) tant qu''actif.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (LECTURE SEULE) :
\echo '>>> colonnes partiel_* sur demande :'
SELECT column_name, data_type FROM information_schema.columns
 WHERE table_name = 'demande' AND column_name LIKE 'partiel_%' ORDER BY column_name;

-- ═════════════════════════════════════════════════════════════════════════════
-- 🔙 ROLLBACK :
--   ALTER TABLE demande DROP COLUMN IF EXISTS partiel_le, DROP COLUMN IF EXISTS partiel_familles,
--     DROP COLUMN IF EXISTS partiel_origine, DROP COLUMN IF EXISTS partiel_leve_le, DROP COLUMN IF EXISTS partiel_leve_par;
