-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 263 — LE COURRIER CLASSÉ EN SPAM PAR GMAIL (lot ERGO-BOITE-3, 27/09/2026)
--
-- CE QU'ELLE AJOUTE : une seule colonne, `gestion_message.spam_le`. Elle porte l'instant où NOUS avons constaté que
-- Gmail tenait ce message pour du spam — pas une décision de notre part.
--
-- 🔴 POURQUOI UNE COLONNE ET NON UN ÉTAT DÉRIVÉ. La règle du module est « état dérivé plutôt qu'état stocké », et
-- elle vaut ici aussi : si le fait pouvait se recalculer, on ne l'écrirait pas. Mais celui-ci ne le peut pas. C'est
-- un fait EXTÉRIEUR, constaté chez Gmail à un instant donné, et Gmail SUPPRIME son spam au bout de 30 jours : le
-- message aura disparu de là-bas alors qu'il vivra encore chez nous. Rien, dans notre base, ne permettrait de
-- redécouvrir qu'il venait du spam. On l'écrit donc, une fois, au moment où on le sait.
--
-- ⚠️ NULLABLE, ET C'EST LE POINT : `NULL` = courrier ordinaire, c'est-à-dire l'immense majorité et tout l'existant.
-- Aucune ligne n'est réécrite, aucune valeur par défaut n'est posée. Appliquer cette migration ne change donc
-- STRICTEMENT RIEN à ce qui est déjà en base — seule la relève suivante commencera à remplir la colonne.
--
-- ⚠️ POURQUOI PAS UN `boolean`. Une date répond en plus à « depuis quand ? », ce qu'un booléen ne saura jamais, et
-- elle se lit exactement comme ses voisines `exclu_le`, `corbeille_le`, `stocke_le`. Même grammaire, même lecture.
--
-- 🔒 CE QU'ELLE NE FAIT PAS : aucune suppression, aucune réécriture, aucun changement de contrainte, aucun trigger.
-- Elle est réversible par un simple `ALTER TABLE gestion_message DROP COLUMN spam_le`.
--
-- LE CODE TOURNE SANS ELLE. `spamDisponible()` (app/lib/gestion/schema.ts) la sonde HORS TRANSACTION ; tant qu'elle
-- est absente, la colonne n'est NOMMÉE NULLE PART — ni en lecture, ni en écriture. L'entrée « Spam » de la colonne
-- de gauche s'affiche alors sans compteur et sa liste est vide, la relève ne lit pas le dossier de spam, et tout le
-- reste du module se comporte exactement comme avant ce lot. Nommer une colonne absente ferait échouer TOUTE la
-- boîte, pas seulement la fonction nouvelle — c'est la leçon de la migration 251.
--
-- POUR L'APPLIQUER :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/263_gestion_message_spam.sql
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE gestion_message ADD COLUMN IF NOT EXISTS spam_le timestamptz;

COMMENT ON COLUMN gestion_message.spam_le IS
  'Instant où la relève a constaté que Gmail classait ce message en spam. NULL = courrier ordinaire. '
  'Écrit une seule fois, à la capture. Gmail supprime son spam au bout de 30 jours : ce que nous avons relevé, '
  'nous le gardons.';

-- INDEX PARTIEL : il n''indexe QUE les lignes de spam (231 aujourd''hui sur 56 821 messages), donc quelques dizaines
-- de kilo-octets. C''est l''index de la liste « Spam », triée du plus récent au plus ancien comme toutes les autres.
-- Les 56 590 lignes ordinaires n''y entrent pas — l''exclusion du spam ailleurs se lit sur `spam_le IS NULL`, que le
-- planificateur sert sans index (la quasi-totalité des lignes la satisfont ; un index y serait inutile, donc nuisible).
CREATE INDEX IF NOT EXISTS gestion_message_spam_idx
  ON gestion_message (recu_le DESC, fil_id DESC)
  WHERE spam_le IS NOT NULL;

COMMIT;
