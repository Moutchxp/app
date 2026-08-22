-- 141_rattachement_daact_declencheur.sql — RATTACHEMENT : la DAACT (achèvement déclaré) comme déclencheur de dossier.
--
-- CONTEXTE : le suivi de rattachement ne se déclenche aujourd'hui que sur ① cadastre ou ② BD TOPO. Un permis passé « Terminé »
-- (etat_dau='6' = DAACT) reste « aucun signal » jusqu'à ce que BD TOPO remesure — des mois plus tard. La DAACT est le signal
-- officiel d'achèvement, et le PLUS PRÉCOCE. ⚠️ Elle OUVRE l'arbitrage (dossier en attente humaine), elle ne le CONCLUT jamais :
-- AUCUNE injection d'altitude automatique. Interrupteur pour l'activer/désactiver (pilotage sans code).
--
-- ① config_veille.rattachement_daact_declencheur_actif (boolean, DEFAULT true). DÉFAUT ACTIVÉ car le stock est VIDE aujourd'hui
--    (0 permis suivi en DAACT) : aucune vague à absorber, seul le flux futur est concerné. Lu au runtime (rattachementConfig).
--
-- ADDITIVE / SÛRE : un seul ADD COLUMN IF NOT EXISTS sur le singleton, aucune donnée touchée, aucun DROP/DELETE/TRUNCATE, aucun
-- trigger. N'affecte NI le moteur de score SVAV, NI config_scoring, NI le golden Asnières. Une seule transaction. Rejouable.
--
-- APPLICATION MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/141_rattachement_daact_declencheur.sql
-- DRY-RUN : remplacer « COMMIT; » par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS rattachement_daact_declencheur_actif boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN config_veille.rattachement_daact_declencheur_actif IS
  'RATTACHEMENT — quand une attestation d''achèvement des travaux (DAACT, etat_dau=''6'') arrive, ouvrir un dossier de rattachement (état « en attente du bâti » tant que BD TOPO n''a pas mesuré le bâtiment ; JAMAIS d''injection d''altitude automatique). Défaut true (stock actuel VIDE — aucune vague). Décochez pour ignorer ce signal.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (s'exécute au lancement) :
\echo '>>> ① colonne + défaut (true) :'
SELECT column_name, data_type, column_default FROM information_schema.columns
WHERE table_name = 'config_veille' AND column_name = 'rattachement_daact_declencheur_actif';
\echo '>>> ② valeur du singleton :'
SELECT rattachement_daact_declencheur_actif FROM config_veille WHERE id = 1;
