-- 235_gestion_destinataires_separes.sql — MODULE « GESTION » : À / Cc / Cci / Reply-To, chacun dans sa colonne. LOT 5-0.
--
-- 🔴 TU NE L'APPLIQUES PAS DEPUIS L'AGENT — migration LIVRÉE NON APPLIQUÉE, Arno l'applique à la main (commande plus bas).
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- POURQUOI — « RÉPONDRE À TOUS » A BESOIN DE SAVOIR QUI ÉTAIT EN COPIE.
--
-- Jusqu'ici la capture fondait `To` et `Cc` dans UNE seule colonne de texte libre (`destinataires`) et jetait `Reply-To`. C'était
-- suffisant pour l'unique usage d'alors : COMPTER des destinataires. Ça ne l'est plus. Sans cette séparation :
--   · « Répondre à tous » remettrait TOUT LE MONDE en destinataire principal — on ne sait pas qui était en copie ;
--   · « Répondre » écrirait à l'expéditeur même quand l'auteur a explicitement demandé qu'on réponde AILLEURS (`Reply-To`).
-- Ce sont deux mails partis à la mauvaise personne, pas deux défauts d'affichage.
--
-- LE MODÈLE RETENU — quatre colonnes `jsonb`, chacune un TABLEAU de `{nom, adresse}`.
--   Pourquoi pas du texte : « Dupont, Jean <j@d.fr> » contient une virgule DANS le nom. Toute colonne texte obligerait à
--   redécouper à chaque lecture, avec la même règle, au même endroit — c'est-à-dire à refaire l'analyse à l'infini, et à la
--   rater une fois sur deux. On range donc la liste DÉJÀ ANALYSÉE, une bonne fois.
--   Pourquoi pas une table de liaison : un destinataire n'a pas de vie propre. Il n'est ni cherché, ni compté, ni recoupé — il
--   est lu avec son message et avec lui seul. Une table de plus coûterait une jointure à chaque affichage pour zéro service.
--
-- 🔴 LE POINT LE PLUS IMPORTANT DE CETTE MIGRATION — `NULL` ET `[]` NE VEULENT PAS DIRE LA MÊME CHOSE, ET NE DOIVENT JAMAIS
--   ÊTRE CONFONDUS :
--     · `NULL`  = « ON N'A JAMAIS REGARDÉ ». C'est l'état des 27 833 messages déjà capturés, écrits avant ce lot.
--     · `'[]'`  = « on a regardé, il n'y avait personne » (un mail sans copie, une remise en Cci seule).
--   Les colonnes n'ont donc AUCUN DEFAULT : les lignes existantes restent à NULL, ce qui les rend reconnaissables d'un simple
--   `WHERE dest_a IS NULL`. C'est ce qui rendra possible, plus tard, une passe qui relira les SEULS EN-TÊTES de ces messages
--   pour les compléter — sans retélécharger un seul corps de mail ni une seule pièce jointe. Mettre un DEFAULT '[]' ici
--   effacerait cette distinction pour toujours : on ne saurait plus lesquels rattraper.
--
-- CE QUI NE CHANGE PAS : `destinataires` (To et Cc fondus) et `nb_destinataires` restent en place et CONTINUENT d'être remplis
--   à l'identique par la capture. Rien n'est retiré, rien n'est réécrit, aucun écran existant ne change de comportement.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- SÛR : DDL ADDITIVE — quatre colonnes NULLABLES sans DEFAULT (donc aucune réécriture de table : PostgreSQL se contente d'un
--   changement de catalogue, instantané même sur 27 833 lignes), quatre CHECK qui n'acceptent qu'un tableau JSON, et UN index
--   partiel qui sert la future passe de rattrapage. Aucune ligne existante n'est modifiée. Aucun DROP de table, aucun DELETE,
--   aucun UPDATE. Ne touche NI le module Permis, NI le moteur SVAV, NI le verdict, NI le golden Asnières
--   (29.107259068449615). Une transaction. Idempotente.
--
-- ⚠️ CE QUE LA BASE NE PEUT PAS GARANTIR, ET QUI L'EST DANS LE CODE : que chaque entrée du tableau soit bien un
--   `{nom, adresse}`. Un CHECK qui descendrait dans chaque élément coûterait à chaque écriture pour une garantie que
--   `analyserListeAdresses` (app/lib/gestion/adresses.ts) donne déjà par construction — c'est la SEULE voie d'écriture, et
--   elle est PURE, donc testée sans base. Le CHECK se borne à interdire qu'on range ici autre chose qu'une liste.
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   export PAGER=cat
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/235_gestion_destinataires_separes.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer.
-- Vérification : voir le bloc en fin de fichier. Rollback : voir tout en bas.
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Quatre colonnes, SANS DEFAULT : c'est le NULL qui porte le sens « pas encore connu » (voir l'encadré ci-dessus).
ALTER TABLE gestion_message
  ADD COLUMN IF NOT EXISTS dest_a     jsonb,
  ADD COLUMN IF NOT EXISTS dest_cc    jsonb,
  ADD COLUMN IF NOT EXISTS dest_cci   jsonb,
  ADD COLUMN IF NOT EXISTS repondre_a jsonb;

COMMENT ON COLUMN gestion_message.dest_a IS
  'LOT 5-0 — destinataires de l''en-tête To, analysés : tableau JSON de {nom, adresse}. NULL = jamais analysé (message capturé avant ce lot) ; [] = analysé, aucun destinataire. Ne JAMAIS confondre les deux : le NULL est ce qui rend le rattrapage possible.';
COMMENT ON COLUMN gestion_message.dest_cc IS
  'LOT 5-0 — destinataires en copie (Cc), même forme que dest_a. C''est cette colonne, et elle seule, qui permet un « Répondre à tous » fidèle.';
COMMENT ON COLUMN gestion_message.dest_cci IS
  'LOT 5-0 — copies cachées (Bcc), même forme. Presque toujours [] sur un message REÇU (une copie cachée n''arrive pas chez le destinataire) ; renseignée sur NOS PROPRES ENVOIS, que la boîte recopie.';
COMMENT ON COLUMN gestion_message.repondre_a IS
  'LOT 5-0 — adresse de réponse demandée par l''auteur (Reply-To), même forme. [] = répondre à l''expéditeur, comme avant.';

-- Les CHECK : on interdit qu'autre chose qu'une LISTE soit rangée ici. `ADD CONSTRAINT` ne connaît pas `IF NOT EXISTS` pour un
--   CHECK — d'où la boucle, qui rend la migration rejouable sans erreur.
DO $$
DECLARE c text;
BEGIN
  FOREACH c IN ARRAY ARRAY['dest_a', 'dest_cc', 'dest_cci', 'repondre_a'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_message_' || c || '_chk') THEN
      EXECUTE format(
        'ALTER TABLE gestion_message ADD CONSTRAINT %I CHECK (%I IS NULL OR jsonb_typeof(%I) = ''array'')',
        'gestion_message_' || c || '_chk', c, c);
    END IF;
  END LOOP;
END $$;

-- LA FUTURE PASSE DE RATTRAPAGE, préparée ici et nulle part ailleurs : « quels messages n'ont jamais été analysés ? ».
--   Index PARTIEL, donc il ne pèse que le temps du rattrapage : une fois toutes les lignes complétées, il ne contient plus
--   rien et ne coûte plus rien. C'est exactement ce qu'on veut d'un index de transition.
CREATE INDEX IF NOT EXISTS gestion_message_dest_inconnus_idx
  ON gestion_message (id) WHERE dest_a IS NULL;

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-APPLICATION (à lancer À LA MAIN — aucune n'écrit quoi que ce soit) :
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- \echo '>>> ① les quatre colonnes existent, et TOUTES les lignes d''avant sont bien à NULL (= à rattraper) :'
--   SELECT count(*) AS total,
--          count(dest_a) AS deja_analyses,
--          count(*) - count(dest_a) AS a_rattraper
--     FROM gestion_message;
--
-- \echo '>>> ② les quatre garde-fous sont posés (les parenthèses comptent : AND lie plus fort que OR) :'
--   SELECT conname FROM pg_constraint
--    WHERE conrelid = 'gestion_message'::regclass
--      AND conname IN ('gestion_message_dest_a_chk', 'gestion_message_dest_cc_chk',
--                      'gestion_message_dest_cci_chk', 'gestion_message_repondre_a_chk')
--    ORDER BY conname;
--
-- \echo '>>> ③ le garde-fou MORD (doit ÉCHOUER : on range autre chose qu''une liste) :'
--   BEGIN;
--     UPDATE gestion_message SET dest_a = '{"nom":"x"}'::jsonb WHERE id = (SELECT min(id) FROM gestion_message);
--   ROLLBACK;
--
-- \echo '>>> ④ l''index de rattrapage est là, et le planificateur le PREND :'
--   EXPLAIN (ANALYZE, BUFFERS) SELECT id FROM gestion_message WHERE dest_a IS NULL LIMIT 1000;
--
-- \echo '>>> ⑤ après quelques relèves, les NOUVEAUX messages arrivent analysés (attendu : des listes, pas des NULL) :'
--   SELECT id, recu_le::date, dest_a, dest_cc, repondre_a
--     FROM gestion_message WHERE dest_a IS NOT NULL ORDER BY id DESC LIMIT 5;
--
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 🔙 ROLLBACK (AUCUN message n'est perdu : ces colonnes ne contiennent rien qui ne soit relisible dans les en-têtes) :
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -c "BEGIN; \
--     DROP INDEX IF EXISTS gestion_message_dest_inconnus_idx; \
--     ALTER TABLE gestion_message DROP CONSTRAINT IF EXISTS gestion_message_dest_a_chk; \
--     ALTER TABLE gestion_message DROP CONSTRAINT IF EXISTS gestion_message_dest_cc_chk; \
--     ALTER TABLE gestion_message DROP CONSTRAINT IF EXISTS gestion_message_dest_cci_chk; \
--     ALTER TABLE gestion_message DROP CONSTRAINT IF EXISTS gestion_message_repondre_a_chk; \
--     ALTER TABLE gestion_message DROP COLUMN IF EXISTS dest_a; \
--     ALTER TABLE gestion_message DROP COLUMN IF EXISTS dest_cc; \
--     ALTER TABLE gestion_message DROP COLUMN IF EXISTS dest_cci; \
--     ALTER TABLE gestion_message DROP COLUMN IF EXISTS repondre_a; \
--     COMMIT;"
--   (le code retombe alors tout seul sur le SQL d'avant : la sonde `destinatairesSeparesDisponibles` répondra « non ».)
-- ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
