-- 180_config_vague_calme.sql — PART-C : délai de CALME d'une VAGUE de pièces avant de lancer le diagnostic de complétude.
--
-- ⚠️ RÈGLE MÉTIER (Arno, 30/08) : une mairie peut envoyer les documents en PLUSIEURS mails successifs. On ne lance PAS un
-- diagnostic de complétude par mail reçu (sinon on réclame des pièces qui arrivent cinq minutes plus tard) : on attend que la
-- VAGUE soit close, puis UN SEUL diagnostic. La vague est close quand le DERNIER mail reçu de la mairie pour cette demande date
-- de plus de N minutes (sur la DATE D'ENVOI du mail, pas l'heure de la relève). N = cette colonne, défaut 10 minutes.
-- La relève MANUELLE diagnostique immédiatement (Arno considère que tout est arrivé) ; l'ENVOI automatique d'une relance, lui,
-- respecte quand même ce calme (garde PART-C, câblée en PART-E).
--
-- 🔴 GARDE : n'affecte NI le moteur SVAV, NI le verdict, NI le golden Asnières (29.107259068449615), NI `batiment`. AUCUN envoi.
--    UNE colonne ADDITIVE sur config_veille (singleton id=1), avec CHECK de plage.
--
-- SÛR : ADD COLUMN IF NOT EXISTS uniquement. Aucun DROP, aucune écriture de données. GOLDEN-SAFE. Idempotente. Une transaction.
-- Requiert config_veille. Application MANUELLE (arrêt au 1er échec) :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/180_config_vague_calme.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». (PART-C : APPLIQUÉE dans le lot.)

BEGIN;

ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS vague_calme_minutes integer NOT NULL DEFAULT 10
  CHECK (vague_calme_minutes BETWEEN 0 AND 1440);  -- minutes de calme avant diagnostic (0 = immédiat ; 1440 = 24 h). Défaut 10.

COMMENT ON COLUMN config_veille.vague_calme_minutes IS
  'PART-C — minutes de CALME avant de lancer le diagnostic de complétude d''une vague de pièces : le diagnostic n''est lancé (en relève automatique) que si le DERNIER mail reçu de la mairie pour la demande date de plus de N minutes (date d''envoi du mail). Évite un diagnostic par mail quand la mairie répond en plusieurs envois. Défaut 10. 0 = immédiat. La relève manuelle diagnostique sans attendre ; l''envoi automatique d''une relance respecte tout de même ce calme.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (LECTURE SEULE) :
\echo '>>> colonne + valeur par défaut :'
SELECT vague_calme_minutes FROM config_veille WHERE id = 1;

-- ═════════════════════════════════════════════════════════════════════════════
-- 🔙 ROLLBACK :
--   ALTER TABLE config_veille DROP COLUMN IF EXISTS vague_calme_minutes;
