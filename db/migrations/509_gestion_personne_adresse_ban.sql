-- 509_gestion_personne_adresse_ban.sql — 🔴🔴 L'ADRESSE OFFICIELLE (BAN) D'UNE PERSONNE, À CÔTÉ DE SON ADRESSE TEXTE (Arno, 20/11/2026, « Adresse officielle BAN », lot 7c).
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL :
--   · gestion_personne_adresse_ban — le format unique de l'adresse d'une personne (identifiant BAN, libellé officiel, numéro et indice, code postal,
--     INSEE, commune), HISTORISÉ : une seule ligne EN COURS par personne (fin IS NULL) ; une nouvelle adresse FERME la précédente (fin, qui, motif) —
--     jamais de modification ni d'effacement. Une personne = un propriétaire (gestion_annuaire_proprietaire), un locataire (gestion_annuaire_locataire),
--     une carte de contact ou de garant (gestion_contact_carte, son adresse POSTALE) ou un apporteur (gestion_location_apporteur).
-- 🔴 LES ADRESSES TEXTE DES PERSONNES (adresse, code_postal, commune, adresse_postale, adresse_nature, adresse_pays) NE SONT NI MODIFIÉES NI SUPPRIMÉES ;
--    les adresses déjà enregistrées ne reçoivent RIEN : seule une NOUVELLE saisie choisie dans la liste (et retrouvée avec certitude) remplit cette table.
-- 🔴 GARDE : elle ne s'applique qu'à la base de recette `svav_recette` (la production : lot 8, décision d'Arno).
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe (psql -1). IDEMPOTENTE (IF NOT EXISTS) : rejouable.

DO $$
BEGIN
  IF current_database() <> 'svav_recette' THEN
    RAISE EXCEPTION 'GARDE 509 : la base est « % », pas svav_recette. Rien n''est appliqué.', current_database();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS gestion_personne_adresse_ban (
  id               bigserial PRIMARY KEY,
  sujet            text NOT NULL CHECK (sujet IN ('proprietaire', 'locataire', 'carte', 'apporteur')),
  sujet_id         bigint NOT NULL,
  ban_id           text NOT NULL,
  libelle_officiel text NOT NULL,
  numero           integer,
  suffixe          text,
  code_postal      text,
  insee            text,
  commune          text,
  texte_source     text,
  cree_le          timestamptz NOT NULL DEFAULT now(),
  cree_par         bigint,
  cree_par_libelle text NOT NULL CHECK (btrim(cree_par_libelle) <> ''),
  fin              timestamptz,
  fin_par          bigint,
  fin_par_libelle  text,
  fin_motif        text,
  CHECK (fin IS NULL OR fin >= cree_le)
);
CREATE UNIQUE INDEX IF NOT EXISTS gestion_personne_adresse_ban_en_cours ON gestion_personne_adresse_ban (sujet, sujet_id) WHERE fin IS NULL;
CREATE INDEX IF NOT EXISTS gestion_personne_adresse_ban_par_ban ON gestion_personne_adresse_ban (ban_id) WHERE fin IS NULL;
COMMENT ON TABLE gestion_personne_adresse_ban IS
  'Adresse officielle BAN d''une personne (509), à côté de son adresse texte : historisée (une ligne en cours par personne), jamais modifiée ni effacée ; remplie seulement par une nouvelle saisie choisie dans la liste.';
