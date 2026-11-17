-- 486_adresse_apporteurs.sql — 🔴🔴 L'ADRESSE D'UN APPORTEUR : CODE POSTAL, COMMUNE, NATURE, PAYS (Arno, 17/11/2026, chantier « Adresses uniformisées », lot 4).
--
-- LE BESOIN (plan validé par Arno le 17/11/2026, lot 4 « Les apporteurs, depuis la Location et Mon espace ») : l'adresse d'un apporteur, un seul champ libre
-- jusqu'ici, passe sur ChampAdresseBan (rue, code postal et commune remplis par le choix), avec la case « Adresse à l'étranger » (Q6 : « champ « Pays »
-- obligatoire en plus du texte libre ») ; une adresse absente de la liste : saisie libre confirmée, marquée « hors liste — à vérifier » (Q1).
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL, sur `gestion_location_apporteur` — exactement la 480 des personnes :
--   · code_postal, commune : remplis par le choix dans la liste (NULL pour une adresse d'avant : elle reste telle quelle dans `adresse`) ;
--   · adresse_nature : 'liste' / 'hors_liste' / 'etranger' ; NULL = d'avant, jamais réécrite ni requalifiée ;
--   · adresse_pays : obligatoire pour 'etranger', interdit sinon (contrainte d'accord nature / pays, celle de la 480) ;
--   · un index partiel des adresses « hors liste » (la liste à contrôler).
-- Aucune ligne touchée. Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE. RECETTE SEULEMENT.
-- ⚠️ Sans elle, la fiche d'avant (un seul champ « Adresse », sans contrôle).

ALTER TABLE gestion_location_apporteur ADD COLUMN IF NOT EXISTS code_postal text;
ALTER TABLE gestion_location_apporteur ADD COLUMN IF NOT EXISTS commune text;
ALTER TABLE gestion_location_apporteur ADD COLUMN IF NOT EXISTS adresse_nature text;
ALTER TABLE gestion_location_apporteur ADD COLUMN IF NOT EXISTS adresse_pays text;

ALTER TABLE gestion_location_apporteur DROP CONSTRAINT IF EXISTS gestion_location_apporteur_adresse_nature_chk;
ALTER TABLE gestion_location_apporteur ADD CONSTRAINT gestion_location_apporteur_adresse_nature_chk CHECK (
  (coalesce(adresse_nature, '') = '' AND adresse_pays IS NULL)
  OR (coalesce(adresse_nature, '') IN ('liste', 'hors_liste') AND adresse_pays IS NULL)
  OR (coalesce(adresse_nature, '') = 'etranger' AND coalesce(btrim(adresse_pays), '') <> ''));

CREATE INDEX IF NOT EXISTS gestion_location_apporteur_hors_liste_idx ON gestion_location_apporteur (id) WHERE adresse_nature = 'hors_liste';

COMMENT ON COLUMN gestion_location_apporteur.adresse_nature IS 'Nature de l''adresse : liste / hors_liste (à vérifier) / etranger (pays obligatoire) ; NULL = d''avant — migration 486.';
