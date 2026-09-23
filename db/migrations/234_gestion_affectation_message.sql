-- 234_gestion_affectation_message.sql — MODULE « GESTION » : un MAIL peut rejoindre un autre événement que son échange. LOT 4d-B2.
--
-- 🔴 TU NE L'APPLIQUES PAS DEPUIS L'AGENT — migration LIVRÉE NON APPLIQUÉE, Arno l'applique à la main (commande plus bas).
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- POURQUOI — UN FIL DE DISCUSSION N'EST PAS TOUJOURS UNE SEULE AFFAIRE.
--
-- La boîte est faite de fils qui dérivent : on parle d'un préavis de départ, et trois messages plus bas quelqu'un signale une fuite.
-- Jusqu'ici tout l'échange allait dans une seule carte, donc l'une des deux affaires se retrouvait rangée sous le titre de l'autre.
-- Il fallait pouvoir détacher UN mail.
--
-- LE MODÈLE RETENU, et pourquoi c'est le plus simple ET le plus sûr : une affectation porte désormais un `message_id` FACULTATIF.
--   · `message_id IS NULL`     → l'affectation couvre TOUT l'échange. C'est le cas d'avant, inchangé, et il reste le cas ordinaire.
--   · `message_id IS NOT NULL` → l'affectation couvre CE SEUL message, et elle PRIME sur celle de son échange.
-- Aucune donnée n'est déplacée, aucun fil n'est scindé, aucun message n'est recopié : le mail reste EXACTEMENT là où la relève
-- l'a écrit, dans son fil, avec ses pièces. Seul son rattachement change. C'est pour cette raison qu'on a écarté la scission du
-- fil en deux : elle aurait réécrit des données de capture pour un geste d'organisation, et rendu le retour en arrière hasardeux.
--
-- RÉVERSIBLE : « Remettre dans son échange » désactive la ligne (elle n'est jamais supprimée) et le mail retrouve sa place.
-- TRAÇABLE : les deux gestes passent par `gestion_journal`, avec qui et quand.
-- HONNÊTE : l'échange d'origine annonce « N mails déplacés vers GES-… » — on ne retire jamais quelque chose en silence.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- SÛR : DDL ADDITIVE — une colonne NULLABLE, et deux index uniques PARTIELS qui remplacent l'ancien en le RAFFINANT (l'ancien
--   interdisait deux affectations actives sur un même fil ; le nouveau dit la même chose pour les affectations d'échange, et
--   ajoute la même garantie par message). Aucune ligne existante n'est modifiée : elles ont toutes `message_id IS NULL` et
--   restent donc couvertes par exactement la même règle qu'avant. Aucun DROP de table, aucun DELETE. Ne touche NI le module
--   Permis, NI le moteur SVAV, NI le verdict, NI le golden Asnières (29.107259068449615). Une transaction. Idempotente.
--
-- ⚠️ CE QUE LA BASE NE PEUT PAS GARANTIR, ET QUI L'EST DANS LE CODE : qu'un `message_id` appartienne bien au `fil_id` de la même
--   ligne. Un CHECK ne peut pas interroger une autre table. `deplacerMessage` lit donc le fil DU MESSAGE et l'écrit lui-même —
--   il n'accepte jamais un couple fourni par l'appelant. Un test le vérifie.
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   export PAGER=cat
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/234_gestion_affectation_message.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer.
-- Vérification : voir le bloc en fin de fichier. Rollback : voir tout en bas.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ON DELETE CASCADE : si un message disparaissait, son rattachement n'aurait plus d'objet. La capture ne supprime JAMAIS de
--   message — c'est une ceinture, pas un usage.
ALTER TABLE gestion_affectation
  ADD COLUMN IF NOT EXISTS message_id bigint REFERENCES gestion_message(id) ON DELETE CASCADE;

COMMENT ON COLUMN gestion_affectation.message_id IS
  'LOT 4d — NULL = l''affectation couvre tout l''échange (cas ordinaire). NON NULL = elle ne couvre que CE message, et elle prime sur celle de son échange. Le message n''est ni déplacé ni recopié : il reste dans son fil, seul son rattachement change. Réversible en désactivant la ligne.';

-- L'ancien index unique portait sur (fil_id) WHERE actif : il interdirait de déplacer un mail d'un fil déjà rattaché. On le
--   RAFFINE en deux règles qui, ensemble, disent la même chose qu'avant pour les lignes existantes.
DROP INDEX IF EXISTS gestion_affectation_fil_actif_idx;

-- ① un échange n'a qu'UNE affectation d'échange active (règle d'avant, restreinte aux lignes sans message).
CREATE UNIQUE INDEX IF NOT EXISTS gestion_affectation_fil_actif_idx
  ON gestion_affectation (fil_id) WHERE actif AND message_id IS NULL;

-- ② un message n'a qu'UNE affectation de message active. Deux clics simultanés ne peuvent pas en créer deux.
CREATE UNIQUE INDEX IF NOT EXISTS gestion_affectation_message_actif_idx
  ON gestion_affectation (message_id) WHERE actif AND message_id IS NOT NULL;

-- Lecture chaude : « quels mails ont été déplacés hors de ce fil ? », posée à chaque affichage d'un échange.
CREATE INDEX IF NOT EXISTS gestion_affectation_message_fil_idx
  ON gestion_affectation (fil_id) WHERE actif AND message_id IS NOT NULL;

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN — aucune n'écrit quoi que ce soit) :
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- \echo '>>> ① la colonne existe, et TOUTES les lignes d''avant sont restées des affectations d''échange :'
--   SELECT count(*) AS total, count(message_id) AS portant_sur_un_seul_mail FROM gestion_affectation;
--
-- \echo '>>> ② les trois index sont en place :'
--   SELECT indexname FROM pg_indexes WHERE tablename = 'gestion_affectation' ORDER BY indexname;
--
-- \echo '>>> ③ la règle d''avant MORD TOUJOURS (doit ÉCHOUER : deux affectations d''échange actives sur un même fil) :'
--   BEGIN;
--     INSERT INTO gestion_affectation (fil_id, evenement_id, motif)
--     SELECT a.fil_id, a.evenement_id, 'test' FROM gestion_affectation a WHERE a.actif AND a.message_id IS NULL LIMIT 1;
--   ROLLBACK;
--
-- \echo '>>> ④ combien de mails sont aujourd''hui déplacés, et vers quoi (attendu au départ : aucune ligne) :'
--   SELECT e.reference, count(*) AS mails_deplaces
--     FROM gestion_affectation a JOIN gestion_evenement e ON e.id = a.evenement_id
--    WHERE a.actif AND a.message_id IS NOT NULL GROUP BY e.reference ORDER BY 2 DESC;
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 🔙 ROLLBACK (les mails déplacés redeviennent de simples messages de leur échange ; AUCUN mail n'est perdu) :
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -c "BEGIN; \
--     DROP INDEX IF EXISTS gestion_affectation_message_actif_idx; \
--     DROP INDEX IF EXISTS gestion_affectation_message_fil_idx; \
--     DELETE FROM gestion_affectation WHERE message_id IS NOT NULL; \
--     ALTER TABLE gestion_affectation DROP COLUMN IF EXISTS message_id; \
--     DROP INDEX IF EXISTS gestion_affectation_fil_actif_idx; \
--     CREATE UNIQUE INDEX gestion_affectation_fil_actif_idx ON gestion_affectation (fil_id) WHERE actif; \
--     COMMIT;"
--   (le DELETE ne porte QUE sur les lignes créées par ce lot — il n'existe pas d'affectation d'échange avec un message_id.)
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
