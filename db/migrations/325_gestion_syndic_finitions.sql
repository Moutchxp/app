-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 325 — LOT FICHE-SYNDIC-FINITIONS : CODE POSTAL ET VILLE, 2ᵉ STANDARD, SUPPRESSION D'UN SYNDIC
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- MIGRATION D'AJOUT UNIQUEMENT : des colonnes nouvelles, toutes facultatives. Rien n'est retiré, renommé ni réécrit.
--
--   · gestion_syndic      : code_postal, ville (l'adresse = rue + code postal + ville) ; telephone_2 (un second
--                           numéro de standard, deux au plus) ; supprime_le / supprime_par / supprime_par_libelle.
--   · gestion_copropriete : code_postal, commune — pour une copropriété prise dans la Base Adresse Nationale locale,
--                           qui n'a pas de lot dans l'annuaire. Celles du portefeuille les lisent sur leurs lots.
--
-- 🔴 « SUPPRIMER CE SYNDIC » NE FAIT AUCUN DELETE. Le syndic reçoit `supprime_le` (qui, quand), ses contacts
-- `retire_le`, et ses liens de copropriété EN COURS sont FERMÉS (`fin`, motif « suppression du syndic ») : les biens
-- repassent en « Créer le syndic », et l'histoire reste lisible. La trace va aussi dans `gestion_journal`
-- (entité « annuaire », action « suppression_syndic »), dont la contrainte n'est pas modifiée.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE gestion_syndic ADD COLUMN IF NOT EXISTS code_postal text;
ALTER TABLE gestion_syndic ADD COLUMN IF NOT EXISTS ville text;
ALTER TABLE gestion_syndic ADD COLUMN IF NOT EXISTS telephone_2 text;
ALTER TABLE gestion_syndic ADD COLUMN IF NOT EXISTS supprime_le timestamptz;
ALTER TABLE gestion_syndic ADD COLUMN IF NOT EXISTS supprime_par bigint;
ALTER TABLE gestion_syndic ADD COLUMN IF NOT EXISTS supprime_par_libelle text;

ALTER TABLE gestion_copropriete ADD COLUMN IF NOT EXISTS code_postal text;
ALTER TABLE gestion_copropriete ADD COLUMN IF NOT EXISTS commune text;
