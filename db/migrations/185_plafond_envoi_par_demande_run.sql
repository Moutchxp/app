-- 185_plafond_envoi_par_demande_run.sql — PLAFOND ANTI-CUMUL : au plus N mail(s) AUTOMATIQUE(s) par DEMANDE et par RUN de veille,
-- TOUS ÉMETTEURS CONFONDUS (relance ordinaire, cascade partielle CASC-3, PART-E « relance sur réponse », saisine CADA auto). Ferme le
-- trou d'audit du 31/08 : PART-E et la cascade partielle pouvaient émettre DEUX relances à la même mairie dans le même run.
--
-- ⚠️ RÈGLE MÉTIER (Arno, 31/08) : N = 1. Un seul envoi automatique par demande et par run. Plafond PAR RUN, JAMAIS par fenêtre de N
-- heures : la règle du 30/08 (PART-E = une relance par NOUVELLE réponse, non limité ENTRE runs) reste intacte. Le butoir CADA et
-- l'échéance légale (ancrés à partiel_le) ne sont JAMAIS touchés par un refus de plafond. Priorité inter-émetteurs = la CASCADE (elle
-- porte l'échéance légale) : dans le moteur, la cascade partielle passe AVANT PART-E, qui est alors reporté au run suivant.
--
-- 🔴 CE QUE FAIT LA MIGRATION : ajoute config_veille.envois_auto_max_par_demande_run (entier, DÉFAUT 1, CHECK 1..10). Lu au runtime
--    (pilotage sans code : ParamVeille + thème « Envoi aux mairies »). Repli sûr = 1 côté code si la colonne manque (137/185 non appliquées).
--    N'affecte NI le moteur SVAV, NI le verdict, NI le golden Asnières (29.107259068449615). AUCUN envoi ici.
--
-- ADDITIVE PURE : ADD COLUMN IF NOT EXISTS + CHECK inline (idempotent : IF NOT EXISTS saute toute la clause si la colonne existe).
-- Aucun DROP/UPDATE de données. Idempotente (relançable). GOLDEN-SAFE. Une transaction. Requiert la table config_veille (singleton id=1).
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/185_plafond_envoi_par_demande_run.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS envois_auto_max_par_demande_run integer NOT NULL DEFAULT 1
  CHECK (envois_auto_max_par_demande_run BETWEEN 1 AND 10);

COMMENT ON COLUMN config_veille.envois_auto_max_par_demande_run IS
  'PLAFOND ANTI-CUMUL — nombre MAXIMUM d''e-mails AUTOMATIQUES envoyés à UNE même demande dans UN seul run de veille, tous émetteurs confondus (relance ordinaire, cascade partielle, PART-E, saisine CADA auto). DÉFAUT 1. Plafond PAR RUN (jamais par fenêtre horaire ; la règle « une relance PART-E par nouvelle réponse » reste vraie ENTRE runs). Un refus ne touche JAMAIS le butoir CADA (ancré à partiel_le).';

-- Vérification (non bloquante) :
SELECT envois_auto_max_par_demande_run FROM config_veille WHERE id = 1;

COMMIT;
