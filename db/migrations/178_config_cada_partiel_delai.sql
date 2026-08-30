-- 178_config_cada_partiel_delai.sql — CASC-2 : délai AVANT saisine CADA sur un DOSSIER PARTIEL, configurable (pilotage sans code).
--
-- ⚠️ RÈGLE MÉTIER (Arno) : sur un dossier partiel (mairie a répondu, pièces manquantes), l'éligibilité CADA N'EST PAS suspendue —
-- une communication partielle est un refus partiel, le recours reste ouvert. On REPOUSSE seulement le point de départ du compteur :
-- il repart pour 1 MOIS ET 4 JOURS à compter de la PREMIÈRE réclamation (demande.partiel_le, CASC-1), jamais de la dernière.
--
-- Ce réglage NE concerne QUE les demandes portant le marqueur « dossier partiel ». La cascade du 22/08 (absence TOTALE de réponse)
-- reste STRICTEMENT INCHANGÉE (aucune colonne existante touchée).
--
-- 🔴 GARDE : n'affecte NI le moteur SVAV, NI le verdict, NI le golden Asnières (29.107259068449615), NI les gardes ETAN-1, NI
--    `batiment`. AUCUN envoi. Deux colonnes ADDITIVES sur config_veille (singleton id=1), avec CHECK de plage.
--
-- SÛR : ADD COLUMN IF NOT EXISTS uniquement. Aucun DROP, aucune écriture de données. GOLDEN-SAFE. Idempotente. Une transaction.
-- Requiert config_veille. Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/178_config_cada_partiel_delai.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS cada_partiel_delai_mois  integer NOT NULL DEFAULT 1
  CHECK (cada_partiel_delai_mois BETWEEN 0 AND 12);   -- part « mois calendaires » du délai prolongé (défaut 1)
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS cada_partiel_delai_jours integer NOT NULL DEFAULT 4
  CHECK (cada_partiel_delai_jours BETWEEN 0 AND 90);  -- part « jours » ajoutée après les mois (défaut 4) → défaut global = 1 mois + 4 jours

COMMENT ON COLUMN config_veille.cada_partiel_delai_mois IS
  'CASC-2 — délai avant saisine CADA sur dossier PARTIEL : nombre de MOIS calendaires depuis la 1re réclamation (demande.partiel_le). Défaut 1 (avec cada_partiel_delai_jours=4 → « 1 mois + 4 jours »). Ne concerne QUE les demandes marquées « dossier partiel » ; la cascade sans réponse est inchangée.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (LECTURE SEULE) :
\echo '>>> colonnes + valeurs par défaut :'
SELECT cada_partiel_delai_mois, cada_partiel_delai_jours FROM config_veille WHERE id = 1;

-- ═════════════════════════════════════════════════════════════════════════════
-- 🔙 ROLLBACK :
--   ALTER TABLE config_veille DROP COLUMN IF EXISTS cada_partiel_delai_mois, DROP COLUMN IF EXISTS cada_partiel_delai_jours;
