-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 289 — « HORS GESTION » HÉRITÉ EN RÉPONDANT, ET PORTÉ JUSQU'AU MESSAGE ENVOYÉ (lot CLASSER-AVANT-ENVOI, 01/10/2026)
--
-- 🔴🔴 MIGRATION LIVRÉE NON APPLIQUÉE. Je demande avant.
--
--    Pour l'appliquer :  psql "$DATABASE_URL" -f db/migrations/289_gestion_hors_gestion_herite.sql
--
-- ═══ 🔴 CE QU'ELLE SERT, ET POURQUOI ELLE EXISTE ════════════════════════════════════════════════════════════════
--
-- DEMANDE D'ARNO (01/10/2026) : « Réponse / Répondre à tous / Transférer : si la conversation est déjà rattachée,
-- interne ou hors gestion, la case est pré-remplie en vert dans le même état (avec Réinitialiser). »
--
-- Des trois états, DEUX voyagent déjà tout seuls :
--   · RATTACHÉ — les biens hérités deviennent des `cibles` du brouillon (colonne jsonb, migration 285), et le
--     rattrapage de la migration 282 les pose sur le message envoyé ;
--   · INTERNE  — la marque porte sur l'ÉCHANGE (migration 281) : la réponse en hérite sans rien écrire de plus.
--
-- « HORS GESTION », LUI, PORTE SUR UN MESSAGE (migration 266), et sur un seul. Une réponse écrite dans un fil
-- marqué ainsi repartait donc « à classer » : la case verte l'aurait dit, et le fil aurait montré le contraire.
-- Cette migration est ce qui manque pour que les trois états se comportent pareil.
--
-- ═══ CE QU'ELLE FAIT, ET RIEN DE PLUS ═══════════════════════════════════════════════════════════════════════════
--
-- TROIS colonnes booléennes NULLABLES, sans valeur par défaut, sur trois tables existantes. Aucune réécriture de
-- table, aucune contrainte existante touchée, aucun DELETE, aucun UPDATE. `NULL` se lit « rien n'a été demandé » —
-- c'est le cas de tout ce qui précède ce lot, et l'absence le dit déjà sans occuper la place.
--
-- ═══ POURQUOI TROIS, ET PAS UNE ═════════════════════════════════════════════════════════════════════════════════
--
--   · `gestion_brouillon`  — l'INTENTION appartient au brouillon : la fermer et la rouvrir doit la retrouver.
--     C'est la raison exacte de la migration 285 pour « Interne », et elle vaut ici à l'identique.
--   · `gestion_envoi`      — l'intention attend que la relève capture le message envoyé, puis un rattrapage pose
--     la marque. Même chemin en deux temps que les migrations 282 et 283.
--   · `gestion_envoi_file` — un envoi peut passer par la FILE. Sans cette colonne, l'intention serait perdue en
--     silence pour tout envoi mis en file, c'est-à-dire précisément quand la base sait la tenir. Une intention
--     qui disparaît selon le chemin emprunté est le genre de défaut qu'on ne reproduit jamais (migration 283).
--
-- ⚠️ CHAQUE COLONNE A SA PROPRE SONDE côté application (`schema.ts`) : elles peuvent diverger si la migration est
-- appliquée à moitié, et nommer une colonne absente ferait échouer TOUTE la lecture, pas seulement la nouveauté.
-- Tant qu'elles manquent, la case verte « Hors gestion » s'affiche et débloque l'envoi — mais le choix n'est pas
-- retrouvé à la réouverture, et la marque n'est pas reportée sur le message envoyé. L'écran le DIT.
--
-- 🔒 Les 🔴🔴 « Documents clients scannés » ne sont concernés à aucun titre.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE gestion_brouillon
  ADD COLUMN IF NOT EXISTS hors_gestion boolean;

ALTER TABLE gestion_envoi
  ADD COLUMN IF NOT EXISTS hors_gestion_demande boolean;

ALTER TABLE gestion_envoi_file
  ADD COLUMN IF NOT EXISTS hors_gestion_demande boolean;

-- La question du rattrapage : « quels envois attendent encore leur marque ? ». Index PARTIEL — les envois
--   ordinaires (l'immense majorite) n'y entrent jamais.
CREATE INDEX IF NOT EXISTS gestion_envoi_hors_gestion_attente_idx
  ON gestion_envoi (id) WHERE hors_gestion_demande;

COMMENT ON COLUMN gestion_brouillon.hors_gestion IS
  'Lot CLASSER-AVANT-ENVOI — ce brouillon repond dans une conversation marquee « hors gestion », et la case '
  '« Classer ce mail » en a herite. Intention du brouillon, jamais une marque : la marque est posee sur le '
  'message envoye, apres la releve. NULL/faux = rien n''a ete herite.';

COMMENT ON COLUMN gestion_envoi.hors_gestion_demande IS
  'Lot CLASSER-AVANT-ENVOI — « Hors gestion » herite pendant l''ecriture. Le rattrapage de la releve pose la '
  'marque sur gestion_hors_gestion des que le message est capture, puis remet cette colonne a faux. '
  'NULL/faux = rien n''a ete demande.';

COMMIT;
