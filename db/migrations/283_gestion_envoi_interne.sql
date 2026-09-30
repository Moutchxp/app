-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 283 — « INTERNE » CHOISI PENDANT L'ÉCRITURE D'UN MESSAGE **NEUF** (lot RATTACHER-EN-ECRIVANT, 30/09/2026)
--
-- 🔴🔴 MIGRATION LIVRÉE NON APPLIQUÉE. Je demande avant.
--
--    Pour l'appliquer :  psql "$DATABASE_URL" -f db/migrations/283_gestion_envoi_interne.sql
--
-- ═══ 🔴 CE QU'ELLE COMPLÈTE, ET POURQUOI ELLE EXISTE À PART ═════════════════════════════════════════════════════
--
-- « Interne » porte sur un ÉCHANGE (migration 281). Quand on RÉPOND à quelqu'un, l'échange existe déjà : le bouton
-- de la modale le marque tout de suite, et c'est fini. Mais quand on écrit un message NEUF — le cas le plus
-- fréquent pour un mot à un collègue —, l'échange n'existe pas encore : il naît quand la relève capture le
-- message dans « Envoyés », quelques minutes plus tard.
--
-- VU À L'ÉCRAN LE 30/09/2026 : cocher « Interne » sur un message neuf affichait, après l'envoi, « Marquez la
-- conversation depuis Classer : elle n'existe qu'une fois le message parti ». C'est honnête, mais c'est une
-- moitié de fonction — on demande à quelqu'un de refaire à la main ce qu'il vient de décider.
--
-- L'INTENTION EST DONC RETENUE ICI, sur l'envoi, et le MÊME rattrapage que les biens cochés (migration 282) la
-- transforme en marque dès que l'échange existe.
--
-- ═══ POURQUOI UNE COLONNE SUR `gestion_envoi`, ET NON UNE LIGNE DANS `gestion_envoi_cible` ══════════════════════
--
-- « Interne » n'est pas une CIBLE : il ne désigne aucun bien. Le loger dans la table des cibles aurait demandé de
-- relâcher sa contrainte `cible_sorte` — celle qui garantit précisément qu'on n'y range que des logements et des
-- événements — pour y mettre un fait qui n'est pas de cette nature. C'est exactement le raisonnement qui avait
-- écarté `gestion_rattachement` pour « hors gestion » (migration 266), et il vaut ici à l'identique.
--
-- ═══ CE QUE CETTE MIGRATION FAIT, ET RIEN DE PLUS ══════════════════════════════════════════════════════════════
--
-- UNE colonne booléenne NULLABLE, sans valeur par défaut, sur `gestion_envoi`. Pas de réécriture de table, aucune
-- contrainte existante touchée, aucun DELETE, aucun UPDATE. `NULL` se lit « rien n'a été demandé » — c'est le cas
-- de tous les envois d'avant ce lot, et l'absence le dit déjà sans occuper la place.
--
-- 🔒 Les 🔴🔴 « Documents clients scannés » ne sont concernés à aucun titre.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE gestion_envoi
  ADD COLUMN IF NOT EXISTS interne_demande boolean;

-- ⚠️ ET LA MÊME COLONNE SUR LA FILE, parce qu'un envoi peut passer par elle. `gestion_envoi_file` porte la demande
--    TELLE QU'ELLE A ÉTÉ FAITE, le temps que le travailleur la reprenne ; sans cette colonne, « Interne » serait
--    perdu en silence pour tout envoi mis en file — c'est-à-dire précisément quand la base sait la tenir. Une
--    intention qui disparaît selon le chemin emprunté est le genre de défaut qu'on ne reproduit jamais.
ALTER TABLE gestion_envoi_file
  ADD COLUMN IF NOT EXISTS interne_demande boolean;

-- La question du rattrapage : « quels envois attendent encore leur marque ? ». Index PARTIEL — les envois
--   ordinaires (l'immense majorité) n'y entrent jamais.
CREATE INDEX IF NOT EXISTS gestion_envoi_interne_attente_idx
  ON gestion_envoi (id) WHERE interne_demande;

COMMENT ON COLUMN gestion_envoi.interne_demande IS
  'Lot RATTACHER-EN-ECRIVANT — « Interne » a été coché dans la modale pendant l''écriture d''un message NEUF, '
  'dont l''échange n''existait pas encore. Le rattrapage de la relève pose la marque sur gestion_fil_interne dès '
  'que le message est capturé, puis remet cette colonne à faux. NULL/faux = rien n''a été demandé.';

COMMIT;
