-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 280 — LE NOM SOUS LEQUEL UNE PIÈCE A ÉTÉ DÉPOSÉE (lot RENOMMER-AVANT-RANGER, 30/09/2026)
--
-- 🔴🔴 MIGRATION LIVRÉE NON APPLIQUÉE. La règle du module : une migration se livre, elle ne s'applique pas toute
-- seule. Je demande avant.
--
-- ═══ CE QU'ELLE AJOUTE, ET POURQUOI UNE SEULE COLONNE ════════════════════════════════════════════════════════
--
-- Arno : « le journal de dépôt garde le nom d'origine ET le nom donné ». Une seule colonne suffit, et c'est
-- délibéré :
--
--   · LE NOM D'ORIGINE EST DÉJÀ EN BASE, dans `gestion_piece.nom_fichier`, et il n'a pas bougé — le renommage ne
--     touche JAMAIS la pièce reçue, c'est la règle du lot. Le recopier ici créerait une seconde vérité qui
--     divergerait au premier réimport. Une jointure donne les deux noms :
--         SELECT p.nom_fichier AS recu_sous, d.nom_depose AS depose_sous
--           FROM gestion_piece_drive d JOIN gestion_piece p ON p.id = d.piece_id;
--
--   · `nom_depose` RESTE NULL QUAND PERSONNE N'A RENOMMÉ. Une colonne remplie à l'identique sur des milliers de
--     lignes ne dirait qu'une chose — « rien n'a été renommé » — que l'absence dit déjà, sans occuper la place.
--     NULL se lit donc « déposée sous son nom d'origine », et c'est le cas de tous les dépôts d'avant ce lot.
--
-- ═══ CE QU'ELLE NE FAIT PAS ══════════════════════════════════════════════════════════════════════════════════
--
-- 🔴 ELLE NE CONDITIONNE PAS LE RENOMMAGE. Sans elle, une pièce renommée part quand même sous le nom choisi :
-- c'est le Drive qui porte ce nom, pas notre base. Ce qui manque alors est la seule TRACE côté application. La
-- sonde `nomDeposeDisponible()` le gère : colonne absente ⇒ elle n'est NOMMÉE NULLE PART, et l'insertion est mot
-- pour mot celle d'avant.
--
-- 🔒 AUCUNE DONNÉE N'EST TOUCHÉE : un ajout de colonne nullable, sans valeur par défaut, sans réécriture de table.
-- Aucun DELETE, aucun UPDATE. Les 🔴🔴 « Documents clients scannés » ne sont concernés à aucun titre : cette table
-- ne décrit que des dépôts faits PAR l'application, et l'archive n'en reçoit aucun (cf. `verdictDeposer`).
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE gestion_piece_drive
  ADD COLUMN IF NOT EXISTS nom_depose text;

COMMENT ON COLUMN gestion_piece_drive.nom_depose IS
  'Nom sous lequel la copie est partie dans le Drive, quand il DIFFÈRE du nom reçu. '
  'NULL = déposée sous son nom d''origine (gestion_piece.nom_fichier), qui reste la seule source de ce nom-là. '
  'Lot RENOMMER-AVANT-RANGER : le renommage ne touche jamais la pièce reçue.';

COMMIT;
