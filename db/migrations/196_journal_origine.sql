-- LOT 100 — ORIGINE (automatique / manuelle) de l'extraction NON-IA, tracée PAR LIGNE de journal, pour fermer la ligne 6 de l'échelle
-- du LOT 99 (« page identifiée mais non analysée » affichait « origine indéterminée » faute de trace). Constat LOT 99 : le discriminant
-- existe au déclenchement (majPar : `analyse:*` = passage en Analyse AUTO · `extraction:*` = relance admin / gabarit MANUELLE) mais
-- n'était écrit que sur `maj_par` des colonnes de valeur (dernier écrivain, par champ), jamais par ligne de journal.
--
-- Liste FERMÉE volontairement RÉDUITE à l'AXE demandé par Arno (« automatique » / « manuelle ») : c'est ce que l'affichage distingue.
-- La SOURCE fine du déclenchement (passage / relance / gabarit) reste disponible dans `maj_par` des colonnes de valeur (audit), NON
-- retirée par ce lot. Nullable : les lignes HISTORIQUES restent à NULL → « indéterminée » (jamais rétro-attribuées à « auto », règle Arno).
--
-- Livrée NON APPLIQUÉE ; code RÉSILIENT si absente (42P01/42703 → INSERT d'avant sans origine, affichage « indéterminée »).
BEGIN;

ALTER TABLE permis_extraction_journal
  ADD COLUMN IF NOT EXISTS origine text
  CHECK (origine IS NULL OR origine IN ('auto', 'manuelle'));

COMMENT ON COLUMN permis_extraction_journal.origine IS
  'LOT 100 — axe d''origine de l''extraction : ''auto'' (passage en Analyse, 56-C) / ''manuelle'' (relance admin, gabarit) / NULL (indéterminée : lignes historiques, jamais présumées). La source fine reste dans maj_par des colonnes de valeur.';

COMMIT;
