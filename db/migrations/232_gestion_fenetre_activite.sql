-- 232_gestion_fenetre_activite.sql — MODULE « GESTION » : la file ne montre que ce qui est ENCORE VIVANT. LOT 4b.
--
-- 🔴 TU NE L'APPLIQUES PAS DEPUIS L'AGENT — migration LIVRÉE NON APPLIQUÉE, Arno l'applique à la main (commande plus bas).
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- POURQUOI — LA FILE EST INUTILISABLE SANS ÇA.
--
-- Le rattrapage a réussi : 5 516 messages des 90 derniers jours capturés, 2 978 tenus hors de la file, 933 échanges « à classer ».
-- Mais présentée telle quelle, la file COMMENCE par des échanges d'il y a trois mois — appels de provisions de syndic, relevés de
-- factures, transferts anciens —, réglés depuis longtemps dans Gmail. Un outil qui réclame en premier ce qui est déjà fait n'est
-- pas un outil de travail : on l'abandonne au bout de dix lignes.
--
-- Ce réglage borne la file à ce qui a bougé RÉCEMMENT (défaut 30 jours, mesuré sur le dernier message de l'échange).
--
-- ⚠️ CE N'EST PAS UNE SUPPRESSION, ET CE N'EST PAS UN MASQUAGE SILENCIEUX. Les échanges plus anciens restent en base, entiers,
-- consultables ; ils cessent seulement de RÉCLAMER quelque chose. Et l'écran annonce leur nombre en clair : « N échanges plus
-- anciens que 30 jours ne sont pas affichés ». Un outil qui cache sans le dire ment ; un outil qui dit ce qu'il ne montre pas
-- reste honnête.
--
-- Réglable sans code : le jour où Arno voudra voir plus loin (ou moins), il change une valeur — pas une ligne de code.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- SÛR : DDL strictement ADDITIVE — un ADD COLUMN IF NOT EXISTS sur `gestion_config` (singleton), avec DEFAULT et CHECK NOMMÉ.
--   Aucune écriture de données, aucun DROP, aucun DELETE. Ne touche NI le module Permis, NI le moteur SVAV, NI le verdict, NI le
--   golden Asnières (29.107259068449615). Une seule transaction. Idempotente, rejouable.
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   export PAGER=cat
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/232_gestion_fenetre_activite.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer.
-- Vérification : voir le bloc en fin de fichier. Rollback : voir tout en bas.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Un échange n'apparaît dans « À classer » que si son DERNIER message date de moins de N jours. La borne haute (3650 = dix ans)
--   permet de tout revoir d'un réglage, sans jamais avoir à toucher au code.
ALTER TABLE gestion_config ADD COLUMN IF NOT EXISTS fenetre_activite_jours integer NOT NULL DEFAULT 30;

ALTER TABLE gestion_config DROP CONSTRAINT IF EXISTS gestion_config_fenetre_activite_chk;
ALTER TABLE gestion_config ADD CONSTRAINT gestion_config_fenetre_activite_chk
  CHECK (fenetre_activite_jours BETWEEN 1 AND 3650);

COMMENT ON COLUMN gestion_config.fenetre_activite_jours IS
  'LOT 4b — un échange n''apparaît dans la file « À classer » que si son DERNIER message date de moins de N jours. Ce n''est NI une suppression NI un masquage silencieux : les échanges plus anciens restent en base, consultables, et l''écran annonce leur nombre. Défaut 30. Ne change RIEN à la capture : tout continue d''être relevé et conservé.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN — aucune n'écrit quoi que ce soit) :
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- \echo '>>> ① le réglage existe, à 30 jours :'
--   SELECT fenetre_activite_jours FROM gestion_config WHERE id = 1;
--
-- \echo '>>> ② ce que la file va montrer, et ce qu''elle va taire (les deux nombres doivent se retrouver à l''écran) :'
--   WITH dernier AS (
--     SELECT DISTINCT ON (m.fil_id) m.fil_id, m.recu_le
--       FROM gestion_message m WHERE m.exclu_le IS NULL
--      ORDER BY m.fil_id, m.recu_le DESC, m.id DESC)
--   SELECT count(*) FILTER (WHERE d.recu_le >= now() - interval '30 days') AS dans_la_file,
--          count(*) FILTER (WHERE d.recu_le <  now() - interval '30 days') AS trop_anciens
--     FROM gestion_fil f JOIN dernier d ON d.fil_id = f.id
--    WHERE f.etat = 'a_classer';
--
-- \echo '>>> ③ la borne MORD (les deux doivent ÉCHOUER, et rien ne doit rester) :'
--   BEGIN; UPDATE gestion_config SET fenetre_activite_jours = 0     WHERE id = 1; ROLLBACK;  -- minimum 1
--   BEGIN; UPDATE gestion_config SET fenetre_activite_jours = 99999 WHERE id = 1; ROLLBACK;  -- maximum 3650
--
-- \echo '>>> ④ le reste de la configuration est INTACT :'
--   SELECT dossier_imap, rattrapage_jours, plafond_par_passe, reconnexions_max FROM gestion_config WHERE id = 1;
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 🔙 ROLLBACK (la file retombe sur sa valeur de repli : 30 jours) :
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -c "BEGIN; \
--     ALTER TABLE gestion_config DROP CONSTRAINT IF EXISTS gestion_config_fenetre_activite_chk; \
--     ALTER TABLE gestion_config DROP COLUMN IF EXISTS fenetre_activite_jours; \
--     COMMIT;"
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
