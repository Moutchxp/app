-- 142_detection_editions.sql — FRAÎCHEUR lot 2/3 : DÉTECTION des nouvelles publications (métadonnées seules, jamais de donnée).
--
-- CONTEXTE : le lot 1 affiche l'ÂGE de ce qu'on détient. Il ne dit pas si une édition plus récente est PUBLIÉE — sauf Sitadel,
-- seule source déjà surveillée. Ce lot ajoute la détection : une interrogation de MÉTADONNÉES par source (index de diffusion IGN,
-- listing cadastre, en-tête HTTP DILA, page annuaire PRADA), quelques Ko chacune, JAMAIS de téléchargement de donnée. Le résultat
-- est persisté ici pour que la tuile affiche « à jour » / « mise à jour disponible » / « non vérifiable » / « échec depuis N jours ».
--
-- ① config_veille.detection_active (boolean, DEFAULT true)  — interrupteur GLOBAL de la détection (pilotage sans code).
-- ② config_veille.detection_intervalle_heures (int, DEFAULT 24, CHECK 1..168) — cadence ; défaut QUOTIDIEN (ces sources publient au
--    mieux tous les mois → un battement rapide n'apporterait rien).
-- ③ TABLE source_detection — une ligne par source : activation par source, dernière vérification (date, succès/échec), dernier
--    succès, édition distante trouvée, motif d'échec. `actif` DEFAULT true : une source absente de la table est réputée surveillée.
--
-- ADDITIVE / SÛRE : deux ADD COLUMN IF NOT EXISTS sur le singleton + un CREATE TABLE IF NOT EXISTS. Aucune donnée touchée, aucun
-- DROP/DELETE/TRUNCATE, aucun trigger. N'affecte NI le moteur SVAV, NI config_scoring, NI le golden Asnières, NI Sitadel (on
-- l'AFFICHE, on ne le touche pas). Une seule transaction. Rejouable.
--
-- APPLICATION MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/142_detection_editions.sql
-- DRY-RUN : remplacer « COMMIT; » par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS detection_active boolean NOT NULL DEFAULT true;
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS detection_intervalle_heures integer NOT NULL DEFAULT 24;

-- Borne de cadence (1 h à 7 j) — cohérente avec les autres bornes de config_veille.
ALTER TABLE config_veille DROP CONSTRAINT IF EXISTS config_veille_detection_intervalle_chk;
ALTER TABLE config_veille ADD CONSTRAINT config_veille_detection_intervalle_chk
  CHECK (detection_intervalle_heures BETWEEN 1 AND 168);

COMMENT ON COLUMN config_veille.detection_active IS
  'FRAÎCHEUR lot 2 — interrupteur global de la détection des nouvelles publications (métadonnées seules). Défaut true. Décochez pour tout suspendre sans désactiver source par source.';
COMMENT ON COLUMN config_veille.detection_intervalle_heures IS
  'FRAÎCHEUR lot 2 — cadence de la détection, en heures (1..168). Défaut 24 (quotidien) : ces sources publient au mieux tous les mois.';

CREATE TABLE IF NOT EXISTS source_detection (
  source            text PRIMARY KEY,               -- clé de source (lidar, bdtopo_bati, cadastre, sitadel, …)
  actif             boolean NOT NULL DEFAULT true,   -- surveillance de CETTE source (Arno peut en désactiver une isolément)
  verifie_le        timestamptz,                     -- dernière TENTATIVE de vérification
  succes            boolean,                         -- la dernière tentative a-t-elle réussi ?
  dernier_succes_le timestamptz,                     -- dernière tentative RÉUSSIE (sert au « échec depuis N jours »)
  edition_distante  text,                            -- édition/millésime trouvé à distance (ex. « 2026-06-15 »)
  date_distante     date,                            -- date de cette édition (comparée à ce qu'on détient)
  motif             text                             -- message d'échec, OU raison de non-vérifiabilité
);

COMMENT ON TABLE source_detection IS
  'FRAÎCHEUR lot 2 — état de détection par source (métadonnées seules, aucun téléchargement de donnée). Une ligne par source ; `actif` DEFAULT true → une source absente est réputée surveillée. `dernier_succes_le` distingue « échec depuis N jours » de « à jour ».';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (s'exécute au lancement) :
\echo '>>> ① colonnes config + défauts :'
SELECT column_name, data_type, column_default FROM information_schema.columns
WHERE table_name = 'config_veille' AND column_name IN ('detection_active','detection_intervalle_heures') ORDER BY column_name;
\echo '>>> ② contrainte de cadence :'
SELECT conname FROM pg_constraint WHERE conname = 'config_veille_detection_intervalle_chk';
\echo '>>> ③ table source_detection :'
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'source_detection' ORDER BY ordinal_position;
