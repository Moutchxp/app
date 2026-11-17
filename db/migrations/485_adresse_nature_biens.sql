-- 485_adresse_nature_biens.sql — 🔴🔴 LA NATURE DE L'ADRESSE D'UN BIEN (Arno, 17/11/2026, chantier « Adresses uniformisées », lot 3).
--
-- LE BESOIN (décision d'Arno du 17/11/2026) : « les adresses des biens (« Nouveau bien », « Modifier le bien », annexes à une autre adresse) passent
-- sur ChampAdresseBan réutilisé tel quel ; plus de Code postal / Commune tapés à la main ; adresse absente de la liste = saisie libre autorisée avec
-- confirmation, marquée « hors liste — à vérifier » ; rue sans numéro = même fenêtre de confirmation ; aucune adresse existante réécrite. » La marque
-- « hors liste — à vérifier » doit être gardée avec l'adresse du bien (et regroupée dans la liste à contrôler, Q1).
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL, sur `gestion_annuaire_lot` (biens et annexes) :
--   · adresse_nature : 'liste' (choisie dans les suggestions et vérifiée) ou 'hors_liste' (saisie libre confirmée) ; NULL = adresse d'avant ce lot
--     (ou tenue par l'import WIPPIMMO), jamais réécrite ni requalifiée. Un bien est en France : pas d'« adresse à l'étranger » ici ;
--   · un index partiel des adresses « hors liste » (la liste à contrôler), comme la 480 pour les personnes.
-- Aucune ligne touchée. Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE. RECETTE SEULEMENT.
-- ⚠️ Sans elle, la saisie d'avant reste (aucun contrôle d'adresse du bien au serveur).

ALTER TABLE gestion_annuaire_lot ADD COLUMN IF NOT EXISTS adresse_nature text;
ALTER TABLE gestion_annuaire_lot DROP CONSTRAINT IF EXISTS gestion_annuaire_lot_adresse_nature_chk;
ALTER TABLE gestion_annuaire_lot ADD CONSTRAINT gestion_annuaire_lot_adresse_nature_chk CHECK (adresse_nature IS NULL OR adresse_nature IN ('liste', 'hors_liste'));
-- la liste des adresses à contrôler (Q1 : « regroupée dans une liste à contrôler »), comme les personnes (480)
CREATE INDEX IF NOT EXISTS gestion_annuaire_lot_hors_liste_idx ON gestion_annuaire_lot (id) WHERE adresse_nature = 'hors_liste';

COMMENT ON COLUMN gestion_annuaire_lot.adresse_nature IS 'Nature de l''adresse du bien : liste (choisie et vérifiée) / hors_liste (saisie libre confirmée, à vérifier) ; NULL = d''avant — migration 485.';
