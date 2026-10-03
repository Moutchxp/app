-- ══ 🔴🔴 LOT ETOILE-SIGNATURES-PIECES — UNE IMAGE INTÉGRÉE AU CORPS N'EST PAS UNE PIÈCE JOINTE ═══════════════════
--
-- RÈGLE D'ARNO (03/10/2026) : « les images intégrées au corps du mail (signatures, logos, pictos, images inline
-- référencées par cid:) ne sont PAS des pièces jointes. Elles ne comptent pas dans le 📎 N de la ligne de liste,
-- ni dans le bouton “N pièces” du fil, ni dans le récapitulatif, ni dans “Ranger dans le Drive”. »
--
-- ═══ 🔴 POURQUOI UNE COLONNE, ALORS QU'UNE RÈGLE EXISTAIT DÉJÀ ══════════════════════════════════════════════════
--
-- La règle d'aujourd'hui (`lisibilite.estImageDeSignature`) juge sur le NOM et la TAILLE : « image*.png », ou
-- moins de 10 ko. C'est une approximation, et le recensement du 03/10/2026 dit de combien :
--
--     14 865 pièces image/*, dont 11 812 dont les OCTETS SONT POSÉS DANS LE CORPS du message
--     10 343 écartées par la règle nom/taille
--      2 345 images INTÉGRÉES que cette règle compte encore comme pièces jointes
--        925 échanges dont le compteur bouge
--
-- Le critère exact est à notre portée, et il ne suppose rien : mailparser pose les parties `related` dans le HTML
-- sous forme de `data:image/…;base64,…`. Une image dont l'empreinte sha256 figure parmi celles des images `data:`
-- du corps EST une image intégrée — éprouvé sur les messages 57424 (correspondant) et 57464 (notre signature).
--
-- 🔴 MAIS CE CRITÈRE NE SE CALCULE PAS DANS UN `WHERE`. Il faut décoder du base64 et hacher, sur un corps qui pèse
-- parfois 250 ko. Le faire à chaque ligne de liste serait impensable. On le calcule UNE FOIS — au dépôt de la
-- pièce, et par une passe de rattrapage pour l'existant — et on le range ici.
--
-- ⚠️ `NULL` VEUT DIRE « PAS ENCORE DÉCIDÉ », et c'est volontaire : la passe de rattrapage ne peut pas conclure sur
-- une pièce sans empreinte (39 dans la base). `NULL` se lit alors comme « ce n'est pas une image intégrée », donc
-- la pièce reste COMPTÉE. On ne fait jamais disparaître une pièce d'un compteur par ignorance.
--
-- 🔒 CETTE MIGRATION N'AJOUTE QU'UNE COLONNE. Aucune pièce n'est supprimée, aucun rattachement n'est touché, rien
-- n'est écrit dans le Drive. Elle se défait d'un `DROP COLUMN`.

ALTER TABLE gestion_piece ADD COLUMN IF NOT EXISTS integree boolean;

COMMENT ON COLUMN gestion_piece.integree IS
  'LOT ETOILE-SIGNATURES-PIECES : true = image posée DANS le corps du message (signature, logo, picto), donc pas '
  'une pièce jointe. NULL = non décidé (pièce sans empreinte) et traité comme « pièce jointe ».';

-- ⚠️ INDEX PARTIEL, et seulement sur `true` : les requêtes de comptage écartent les intégrées, elles ne les
--    cherchent jamais. Un index complet pèserait sur 27 000 lignes pour servir une condition qui en vise 12 000.
CREATE INDEX IF NOT EXISTS gestion_piece_integree_idx ON gestion_piece (message_id) WHERE integree;
