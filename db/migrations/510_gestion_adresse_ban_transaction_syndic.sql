-- 510_gestion_adresse_ban_transaction_syndic.sql — 🔴🔴 LE FORMAT UNIQUE (BAN) DES ADRESSES DE LA TRANSACTION ET DU CABINET SYNDIC (Arno, 20/11/2026, « Adresse officielle BAN », lot 7d).
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL : la table de la 509 (gestion_personne_adresse_ban) accepte trois sujets de plus —
--   · 'transaction_vente'    : l'adresse du bien d'une vente ou d'un compromis (transaction_vente.adresse_bien) ;
--   · 'transaction_personne' : l'adresse d'un vendeur, d'un acquéreur ou d'un représentant (transaction_personne.adresse) ;
--   · 'syndic'               : l'adresse du cabinet d'un syndic (gestion_syndic).
-- 🔴 AUCUNE DONNÉE N'EST TOUCHÉE : les chaînes d'adresse existantes (adresse_bien, adresse, rue / code postal / ville du syndic) ne changent pas ; seule
--    une NOUVELLE saisie choisie dans la liste et retrouvée avec certitude remplit le format unique, à côté de la chaîne, jamais à sa place.
-- 🔴 GARDE (décision d'Arno du 20/11/2026, remplace la garde « svav_recette seulement ») : elle ne s'applique qu'à la base de PRODUCTION
--    `sansvisavis` ou à la recette `svav_recette` ; toute autre base est refusée. Le schéma produit est inchangé.
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe (psql -1). REJOUABLE : la contrainte est remplacée par la même, élargie.

DO $$
BEGIN
  IF current_database() NOT IN ('sansvisavis', 'svav_recette') THEN
    RAISE EXCEPTION 'GARDE 510 : la base est « % », ni sansvisavis ni svav_recette. Rien n''est appliqué.', current_database();
  END IF;
END $$;

ALTER TABLE gestion_personne_adresse_ban DROP CONSTRAINT IF EXISTS gestion_personne_adresse_ban_sujet_check;
ALTER TABLE gestion_personne_adresse_ban ADD CONSTRAINT gestion_personne_adresse_ban_sujet_check
  CHECK (sujet IN ('proprietaire', 'locataire', 'carte', 'apporteur', 'transaction_vente', 'transaction_personne', 'syndic'));
COMMENT ON TABLE gestion_personne_adresse_ban IS
  'Adresse officielle BAN d''une personne (509) — et, depuis la 510, de l''adresse du bien d''une vente, d''un vendeur ou acquéreur, du cabinet d''un syndic — à côté de la chaîne d''adresse : historisée, jamais modifiée ni effacée ; remplie seulement par une nouvelle saisie choisie dans la liste.';
