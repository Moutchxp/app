-- 480_adresse_nature_personnes.sql — 🔴🔴 LA NATURE DE L'ADRESSE D'UNE PERSONNE (Arno, 17/11/2026, chantier « Adresses uniformisées », lot 2).
--
-- LE BESOIN : toute adresse française d'une personne (propriétaire, locataire, garant, contact) se choisit dans les suggestions de la Base
-- Adresse Nationale (rue, code postal et commune remplis ensemble) ; deux exceptions, MARQUÉES comme telles : une adresse française absente de
-- la liste (saisie libre, confirmée, « hors liste — à vérifier », regroupée dans une liste à contrôler) et une adresse à l'étranger (saisie
-- libre, PAYS obligatoire). Il faut donc garder, avec l'adresse, ce qu'elle est.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL, sur les trois tables qui portent l'adresse d'une personne (propriétaires, locataires, cartes de contact) :
--   · adresse_nature : 'liste' (choisie dans les suggestions et vérifiée), 'hors_liste', 'etranger' ; NULL = adresse d'avant ce lot (ou aucune),
--     jamais réécrite ni requalifiée ;
--   · adresse_pays : le pays d'une adresse à l'étranger (obligatoire pour elle, interdit pour les autres).
-- Aucune ligne touchée. Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE. RECETTE SEULEMENT.
-- ⚠️ Sans elle, la saisie d'avant reste (aucun contrôle d'adresse au serveur).

ALTER TABLE gestion_annuaire_proprietaire ADD COLUMN IF NOT EXISTS adresse_nature text;
ALTER TABLE gestion_annuaire_proprietaire ADD COLUMN IF NOT EXISTS adresse_pays text;
ALTER TABLE gestion_annuaire_locataire ADD COLUMN IF NOT EXISTS adresse_nature text;
ALTER TABLE gestion_annuaire_locataire ADD COLUMN IF NOT EXISTS adresse_pays text;
ALTER TABLE gestion_contact_carte ADD COLUMN IF NOT EXISTS adresse_nature text;
ALTER TABLE gestion_contact_carte ADD COLUMN IF NOT EXISTS adresse_pays text;

ALTER TABLE gestion_annuaire_proprietaire DROP CONSTRAINT IF EXISTS gestion_annuaire_proprietaire_adresse_nature_chk;
ALTER TABLE gestion_annuaire_proprietaire ADD CONSTRAINT gestion_annuaire_proprietaire_adresse_nature_chk CHECK (
  (coalesce(adresse_nature, '') = '' AND adresse_pays IS NULL)
  OR (coalesce(adresse_nature, '') IN ('liste', 'hors_liste') AND adresse_pays IS NULL)
  OR (coalesce(adresse_nature, '') = 'etranger' AND coalesce(btrim(adresse_pays), '') <> ''));
ALTER TABLE gestion_annuaire_locataire DROP CONSTRAINT IF EXISTS gestion_annuaire_locataire_adresse_nature_chk;
ALTER TABLE gestion_annuaire_locataire ADD CONSTRAINT gestion_annuaire_locataire_adresse_nature_chk CHECK (
  (coalesce(adresse_nature, '') = '' AND adresse_pays IS NULL)
  OR (coalesce(adresse_nature, '') IN ('liste', 'hors_liste') AND adresse_pays IS NULL)
  OR (coalesce(adresse_nature, '') = 'etranger' AND coalesce(btrim(adresse_pays), '') <> ''));
ALTER TABLE gestion_contact_carte DROP CONSTRAINT IF EXISTS gestion_contact_carte_adresse_nature_chk;
ALTER TABLE gestion_contact_carte ADD CONSTRAINT gestion_contact_carte_adresse_nature_chk CHECK (
  (coalesce(adresse_nature, '') = '' AND adresse_pays IS NULL)
  OR (coalesce(adresse_nature, '') IN ('liste', 'hors_liste') AND adresse_pays IS NULL)
  OR (coalesce(adresse_nature, '') = 'etranger' AND coalesce(btrim(adresse_pays), '') <> ''));

-- la liste à contrôler (« hors liste — à vérifier ») : lue sans parcourir toute la table
CREATE INDEX IF NOT EXISTS gestion_annuaire_proprietaire_hors_liste_idx ON gestion_annuaire_proprietaire (id) WHERE adresse_nature = 'hors_liste';
CREATE INDEX IF NOT EXISTS gestion_annuaire_locataire_hors_liste_idx ON gestion_annuaire_locataire (id) WHERE adresse_nature = 'hors_liste';
CREATE INDEX IF NOT EXISTS gestion_contact_carte_hors_liste_idx ON gestion_contact_carte (id) WHERE adresse_nature = 'hors_liste';
