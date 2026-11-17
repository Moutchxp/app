-- 489_gestion_copropriete_batiment_adresse.sql — 🔴🔴 LES BÂTIMENTS RATTACHÉS À LEUR ADRESSE (Arno, 17/11/2026, « Adresses multiples d'une copropriété », lot 2).
--
-- LA DÉCISION (Arno, 17/11/2026) : « BÂTIMENTS RATTACHÉS À LEUR ADRESSE, pas à la copropriété entière : un nom de bâtiment est unique pour une même adresse
-- (jamais deux « A » au 7 rue X), mais peut se répéter d'une adresse à l'autre de la même copropriété (7 rue X : A, B ; 9 rue X : A, B — ce sont quatre
-- bâtiments distincts). […] un bâtiment est identifié par (adresse, nom) » ; « Lot 2 : migration au numéro libre suivant (adresse sur chaque bâtiment,
-- unicité (copropriété, adresse, nom), rien supprimé ni renommé, idempotente, enveloppée, recette seulement) […] Aucune reprise réelle avant validation
-- d'Arno. »
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL :
--   · le registre des bâtiments (gestion_copropriete_batiment, 476) reçoit l'ADRESSE de chaque bâtiment (adresse_cle : la clé de l'adresse de la
--     copropriété — sa principale ou une de ses adresses secondaires, 335). VIDE pour tous les bâtiments existants : vide = « adresse à préciser » ;
--     la reprise (lot 3, après validation d'Arno du rapport à blanc) la remplira, jamais cette migration ;
--   · l'unicité (copropriété, adresse, nom) pour les bâtiments dont l'adresse est connue.
-- Aucune ligne existante touchée ; rien supprimé ni renommé. L'ancienne unicité (copropriété, nom) RESTE pour l'instant : elle ne sera remplacée qu'avec
-- l'écriture par adresse (lot 3) — d'ici là, rien ne change à l'écran ni dans les écritures.
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE. RECETTE SEULEMENT.

ALTER TABLE gestion_copropriete_batiment ADD COLUMN IF NOT EXISTS adresse_cle text;

CREATE UNIQUE INDEX IF NOT EXISTS gestion_copropriete_batiment_adresse_unique
  ON gestion_copropriete_batiment (copropriete_id, adresse_cle, batiment_cle) WHERE adresse_cle IS NOT NULL;

COMMENT ON COLUMN gestion_copropriete_batiment.adresse_cle IS 'L''adresse du bâtiment (clé d''une adresse de sa copropriété : principale ou secondaire) ; vide = adresse à préciser — migration 489.';
