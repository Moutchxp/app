-- LOT 113 — ÉLARGIR mairie_contact.source pour la provenance 'annuaire_banatic' : e-mails de mairie relevés FICHE PAR FICHE sur
-- l'annuaire BANATIC (Base nationale sur l'intercommunalité, DGCL — www.banatic.interieur.gouv.fr), Licence Ouverte Etalab 2.0.
--
-- POURQUOI UNE VALEUR DISTINCTE de 'annuaire' (= api-lannuaire / service-public.fr) :
--   `doitRemplacerDepuisAnnuaire` (app/lib/sitadel/mairieContact.ts) ne rafraîchit QUE `source='annuaire'`. Une ligne
--   'annuaire_banatic' est donc PROTÉGÉE d'un écrasement par `mairie:contact:import` (api-lannuaire), tout en restant honnête :
--   `statut` reste 'presume' (aucun humain n'a vérifié l'adresse), donc la ligne demeure rafraîchissable par un futur relevé
--   BANATIC, et n'est jamais confondue avec une saisie humaine ('saisie_manuelle'/'confirme', que la garde protège aussi).
--   La paternité + la source + la DATE du relevé (obligation Etalab) sont portées, par fiche, dans `mairie_contact.note`.
--
-- MÊME MOTIF/STYLE que la migration 068 (ajout de 'annuaire_dila') : on DROP IF EXISTS puis on RE-CRÉE la contrainte du MÊME nom,
-- liste ÉLARGIE — AUCUNE valeur retirée. IDEMPOTENT : rejouer reproduit exactement la contrainte élargie.
--
-- Livrée NON APPLIQUÉE ; le porteur l'applique et confirme avant la pose des 12.
BEGIN;

ALTER TABLE mairie_contact DROP CONSTRAINT IF EXISTS mairie_contact_source_check;
ALTER TABLE mairie_contact ADD CONSTRAINT mairie_contact_source_check
  CHECK (source IN ('annuaire', 'saisie_manuelle', 'reponse_mairie', 'annuaire_dila', 'annuaire_banatic'));

COMMIT;
