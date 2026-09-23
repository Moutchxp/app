-- 231_gestion_uid_et_pieces_calendrier.sql — MODULE « GESTION » : mémoriser l'UID des messages, et accepter les
-- invitations de rendez-vous. LOT 3-quinquies.
--
-- 🔴 TU NE L'APPLIQUES PAS DEPUIS L'AGENT — migration LIVRÉE NON APPLIQUÉE, Arno l'applique à la main (commande plus bas).
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- PARTIE 1 — L'UID DU MESSAGE, ET L'UIDVALIDITY DU DOSSIER.
--
-- POURQUOI : une passe de rattrapage repart de la même fenêtre tant que le rattrapage est inachevé. Pour AVANCER, elle doit
-- écarter les messages DÉJÀ LUS — et pour les écarter, il faut les reconnaître. Sans UID mémorisé, la seule façon de
-- reconnaître un message est de demander son enveloppe au serveur : c'est peu (quelques centaines d'octets), mais c'est
-- 5 500 enveloppes à chaque passe. Avec l'UID en base, la reconnaissance ne coûte RIEN côté serveur.
--
-- ⚠️ POURQUOI L'UIDVALIDITY EST INDISPENSABLE, et pas un raffinement : un UID n'a de sens QUE dans une incarnation donnée du
-- dossier. Si le serveur recrée le dossier (migration de boîte, restauration), il annonce une nouvelle UIDVALIDITY et
-- RÉATTRIBUE les UID depuis 1 — les anciens désignent alors d'autres messages. Les mémoriser sans elle ferait prendre des
-- messages jamais lus pour des messages déjà lus, et les ferait disparaître en silence. Avec elle, une UIDVALIDITY qui change
-- rend simplement les UID connus caducs : on les ignore en bloc et on retombe sur la reconnaissance par Message-ID.
--
-- 🔒 LA RELÈVE FONCTIONNE SANS CETTE MIGRATION : colonnes absentes ⇒ PostgreSQL répond « colonne inconnue » (42703) ⇒ le code
-- réécrit sa requête sans elles. Le rattrapage avance exactement pareil ; il paie seulement une enveloppe par message déjà
-- connu, au lieu de rien. Appliquer la 231 ne fait qu'économiser ce coût.
--
-- PARTIE 2 — LES INVITATIONS DE RENDEZ-VOUS.
-- `text/calendar` et `application/ics` rejoignent les types de pièces acceptés : une invitation est une pièce comme une autre,
-- et la refuser laissait une ligne « type non autorisé » là où il y avait un rendez-vous. AJOUT SANS ÉCRASEMENT : la liste
-- n'est complétée que si le type n'y figure pas déjà — un réglage fait à la main par Arno n'est jamais écrasé.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- SÛR : DDL ADDITIVE (deux ADD COLUMN IF NOT EXISTS, un CREATE INDEX IF NOT EXISTS) + deux UPDATE de données BORNÉS au
--   singleton de configuration et IDEMPOTENTS (clause NOT LIKE : rejouer n'ajoute rien une seconde fois). Aucun DROP, aucun
--   DELETE, aucune colonne existante modifiée en place. Ne touche NI le module Permis, NI le moteur SVAV, NI le verdict, NI le
--   golden Asnières (29.107259068449615). Une seule transaction. Rejouable.
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   export PAGER=cat
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/231_gestion_uid_et_pieces_calendrier.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer.
-- Vérification : voir le bloc en fin de fichier. Rollback : voir tout en bas.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- PARTIE 1 — UID + UIDVALIDITY
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- NULLABLES à dessein : les messages déjà capturés n'ont pas d'UID mémorisé, et il serait faux d'en inventer un. Ils seront
--   simplement reconnus par leur Message-ID (une enveloppe), comme aujourd'hui ; les suivants, eux, ne coûteront rien.
ALTER TABLE gestion_message ADD COLUMN IF NOT EXISTS uid_imap     bigint;
ALTER TABLE gestion_message ADD COLUMN IF NOT EXISTS uid_validity bigint;

-- L'index sert L'UNIQUE requête qui les lit : « parmi ces UID, lesquels connais-je sous cette UIDVALIDITY ? ». Partiel, donc
--   il ne porte que les lignes qui ont réellement un UID (les anciennes n'y entrent pas).
CREATE INDEX IF NOT EXISTS gestion_message_uid_idx
  ON gestion_message (uid_validity, uid_imap) WHERE uid_imap IS NOT NULL;

COMMENT ON COLUMN gestion_message.uid_imap IS
  'LOT 3-quinquies — UID du message dans le dossier IMAP. Permet de reconnaître un message DÉJÀ LU sans rien demander au serveur. NULL pour les messages capturés avant cette migration (ils restent reconnus par leur Message-ID). ⚠️ N''a de sens QUE sous l''uid_validity de la même ligne.';
COMMENT ON COLUMN gestion_message.uid_validity IS
  'LOT 3-quinquies — UIDVALIDITY du dossier au moment de la capture. Si le serveur la change (dossier recréé, boîte migrée), il RÉATTRIBUE les UID depuis 1 : les anciens désignent alors d''autres messages. La comparer AVANT d''utiliser un uid_imap est ce qui empêche de prendre un message jamais lu pour un message déjà lu.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- PARTIE 2 — INVITATIONS DE RENDEZ-VOUS dans les types de pièces acceptés (AJOUT, jamais un écrasement).
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
UPDATE gestion_config
   SET types_pieces_acceptes = types_pieces_acceptes || ',text/calendar', maj_le = now()
 WHERE id = 1 AND types_pieces_acceptes NOT LIKE '%text/calendar%';

UPDATE gestion_config
   SET types_pieces_acceptes = types_pieces_acceptes || ',application/ics', maj_le = now()
 WHERE id = 1 AND types_pieces_acceptes NOT LIKE '%application/ics%';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN — aucune n'écrit quoi que ce soit) :
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- \echo '>>> ① les deux colonnes et leur index existent :'
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--    WHERE table_name = 'gestion_message' AND column_name IN ('uid_imap','uid_validity') ORDER BY column_name;
--   SELECT indexname FROM pg_indexes WHERE tablename = 'gestion_message' AND indexname = 'gestion_message_uid_idx';
--
-- \echo '>>> ② les messages DÉJÀ capturés n''ont pas d''UID (c''est normal : on n''en invente pas) :'
--   SELECT count(*) FILTER (WHERE uid_imap IS NULL) AS sans_uid, count(*) FILTER (WHERE uid_imap IS NOT NULL) AS avec_uid
--     FROM gestion_message;
--   -- attendu juste après application : TOUT en « sans_uid ». Les passes suivantes rempliront « avec_uid ».
--
-- \echo '>>> ③ les invitations de rendez-vous sont acceptées :'
--   SELECT types_pieces_acceptes FROM gestion_config WHERE id = 1;
--   -- attendu : la liste d''avant, SUIVIE de « ,text/calendar,application/ics »
--
-- \echo '>>> ④ idempotence : relancer la migration ne doit RIEN ajouter une seconde fois.'
--   -- Relancer la commande d'application, puis refaire ③ : la liste doit être IDENTIQUE.
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 🔙 ROLLBACK (la relève retombe sur la reconnaissance par Message-ID — une enveloppe par message déjà connu) :
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -c "BEGIN; \
--     DROP INDEX IF EXISTS gestion_message_uid_idx; \
--     ALTER TABLE gestion_message DROP COLUMN IF EXISTS uid_validity; \
--     ALTER TABLE gestion_message DROP COLUMN IF EXISTS uid_imap; \
--     COMMIT;"
--   (Les deux types de pièces, eux, ne se retirent pas d'un rollback : ce sont des réglages, ils s'éditent dans la configuration.)
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
