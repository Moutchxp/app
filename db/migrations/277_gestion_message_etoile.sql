-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 277 — L'ÉTOILE DE GMAIL, CHEZ NOUS (lot ETOILE-ET-SIGNATURE, 29/09/2026)
--
-- CE QU'ELLE AJOUTE : une colonne, `gestion_message.etoile_le`, et un index partiel pour la lire. La colonne porte
-- l'instant où l'on a CONSTATÉ que Gmail tenait ce message pour étoilé. NULL = pas d'étoile.
--
-- ═══ 🔴🔴 LE DÉFAUT QU'ELLE RÉPARE, ET IL SE VOIT À L'ÉCRAN ═════════════════════════════════════════════════════
--
-- Constat d'Arno : dans le fil 334, le message du 18 septembre porte l'étoile rouge. Le filtre étoile de la
-- Réception ne renvoie RIEN. Mesuré le 29/09/2026, la cause est entière :
--
--     étoiles dans GMAIL (API, « is:starred »)  → 611 messages
--     étoiles dans NOTRE filtre                 → 0 conversation (table gestion_fil_etoile : 8 lignes, 0 à `true`)
--
-- IL Y AVAIT DEUX ÉTOILES, et rien ne le disait à l'écran. Celle de la CONVERSATION bascule le libellé STARRED
-- dans Gmail et ne laisse aucune trace chez nous (`gmailAction.basculerEtoile`) ; celle de la LISTE écrivait dans
-- `gestion_fil_etoile`, une table à nous que Gmail ne connaît pas — et c'est elle, et elle seule, que le filtre
-- lisait. Poser l'étoile là où on la voit ne pouvait donc jamais la faire apparaître dans le filtre.
--
-- 🔴 DÉCISION D'ARNO : UNE SEULE ÉTOILE, CELLE DE GMAIL. Lue et écrite dans les deux sens. Cette colonne est le
-- MIROIR de `STARRED` — jamais une opinion de notre application. La relève la réconcilie depuis l'API Gmail, comme
-- elle le fait déjà pour la corbeille (migration 275) et pour la même raison : les gestes passent par l'API, donc
-- l'état se relit par l'API. Deux sources pour un même fait finissent toujours par se contredire.
--
-- ⚠️ `gestion_fil_etoile` N'EST NI SUPPRIMÉE NI VIDÉE. Ses 8 lignes restent, avec qui les a touchées et quand.
-- Elle cesse seulement d'être lue par le filtre. Rien de ce que quelqu'un a écrit n'est effacé.
--
-- ⚠️ NULLABLE, AUCUNE LIGNE RÉÉCRITE. Appliquer cette migration ne change STRICTEMENT RIEN à ce qui est en base :
-- les 611 étoiles n'arrivent qu'à la première réconciliation, et elles arrivent EN LISANT GMAIL.
--
-- ═══ L'INDEX, ET POURQUOI IL EST PARTIEL ════════════════════════════════════════════════════════════════════════
--
-- Le filtre demande « cet échange a-t-il AU MOINS UN message étoilé ? », soit un EXISTS sur `fil_id`. Un index
-- ordinaire sur (fil_id) porterait les 57 237 messages pour en servir 611. Le partiel ne contient QUE les lignes
-- étoilées — quelques centaines — et le planificateur le prend pour l'EXISTS comme pour le compteur.
--
-- 🔒 CE QU'ELLE NE FAIT PAS : aucune suppression, aucune réécriture, aucune contrainte, aucun trigger. Réversible
-- par `DROP INDEX gestion_message_etoile_idx` puis `ALTER TABLE gestion_message DROP COLUMN etoile_le`.
--
-- LE CODE TOURNE SANS ELLE. `etoileGmailDisponible()` (app/lib/gestion/schema.ts) la sonde HORS TRANSACTION ; tant
-- qu'elle est absente, la colonne n'est NOMMÉE NULLE PART, la réconciliation ne tourne pas, et le filtre étoile
-- retombe exactement sur ce qu'il lisait avant ce lot.
--
-- POUR L'APPLIQUER :
--   cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/277_gestion_message_etoile.sql
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE gestion_message ADD COLUMN IF NOT EXISTS etoile_le timestamptz;

COMMENT ON COLUMN gestion_message.etoile_le IS
  'Instant où l''on a constaté que Gmail tenait ce message pour étoilé (libellé STARRED). NULL = pas d''étoile. '
  'MIROIR de Gmail, jamais une opinion de notre application : la relève la réconcilie depuis l''API Gmail, et tout '
  'geste d''étoile chez nous passe d''abord par Gmail. Depuis le 29/09/2026 (lot ETOILE-ET-SIGNATURE).';

CREATE INDEX IF NOT EXISTS gestion_message_etoile_idx
  ON gestion_message (fil_id) WHERE etoile_le IS NOT NULL;

COMMIT;
