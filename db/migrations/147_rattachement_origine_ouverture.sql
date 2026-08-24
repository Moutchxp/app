-- 147_rattachement_origine_ouverture.sql — Module VEILLE PERMIS (chantier M5) : TRACER l'ORIGINE d'ouverture d'un dossier de
-- rattachement — 'detection' (le moteur FUS-2 a persisté le dossier) vs 'manuelle' (Arno a ouvert l'arbitrage à la main).
--
-- POURQUOI : depuis M1/M2/M3, l'affectation par cases à cocher et la saisie d'une cote par polygone sont livrées, mais aucun dossier
-- réel n'atteint `arbitrage_demande` (le déclencheur est un détecteur de DELTA : sur 11430, 16 polygones figés == 16 vivants → delta 0
-- → verdict RIEN → aucune écriture). On ajoute un CHEMIN D'OUVERTURE MANUELLE à côté (le moteur de détection n'est PAS modifié). Un
-- dossier ouvert à la main NE DOIT PAS se faire passer pour une détection → cette colonne le dit EN BASE (l'événement append-only
-- `ouverture_manuelle` le dit aussi côté journal). La colonne n'est jamais réécrite par la réévaluation.
--
-- SÛR : DDL strictement ADDITIVE (ADD COLUMN IF NOT EXISTS + ADD CONSTRAINT idempotent). Valeur par défaut 'detection' → les dossiers
-- existants (et tous les futurs dossiers de DÉTECTION, qui ne renseignent pas la colonne) sont 'detection' automatiquement. Aucune
-- colonne existante touchée, aucun DROP, aucune réécriture de lignes. Ne touche NI le moteur de verdict SVAV NI le golden. Idempotente.
-- Un seul BEGIN/COMMIT. Requiert permis_rattachement. Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/147_rattachement_origine_ouverture.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ».

BEGIN;

ALTER TABLE permis_rattachement
  ADD COLUMN IF NOT EXISTS origine_ouverture text NOT NULL DEFAULT 'detection';

-- Liste FERMÉE : 'detection' (moteur) | 'manuelle' (ouverture à la main). Ajoutée idempotente.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'permis_rattachement_origine_ouverture_chk') THEN
    ALTER TABLE permis_rattachement
      ADD CONSTRAINT permis_rattachement_origine_ouverture_chk
      CHECK (origine_ouverture IN ('detection', 'manuelle'));
  END IF;
END $$;

COMMENT ON COLUMN permis_rattachement.origine_ouverture IS
  'M5 — origine du dossier : ''detection'' (persisté par le moteur FUS-2) ou ''manuelle'' (arbitrage ouvert à la main par Arno, sans changement BD TOPO). Jamais réécrite par la réévaluation. Complète l''événement append-only ''ouverture_manuelle''. Le moteur de détection reste inchangé.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (s'exécute quand tu lances le fichier — AFFICHE le résultat) :
\echo '>>> colonne origine_ouverture :'
SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
 WHERE table_name = 'permis_rattachement' AND column_name = 'origine_ouverture';
\echo '>>> contrainte (liste fermée detection|manuelle) :'
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'permis_rattachement_origine_ouverture_chk';
\echo '>>> répartition actuelle (tout doit être ''detection'', 0 ligne aujourd''hui) :'
SELECT origine_ouverture, count(*) FROM permis_rattachement GROUP BY origine_ouverture;
