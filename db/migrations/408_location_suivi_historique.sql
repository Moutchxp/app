-- 408_location_suivi_historique.sql — LOCATION « OUTILS DE SUIVI » (Arno, 23/10/2026) : L'HISTORIQUE 2019 → 2025 DU SUIVI MENSUEL.
-- Suite des 406 et 407 (qu'elle suppose appliquées).
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL (aucune ligne existante n'est modifiée ni supprimée) :
--   · `gestion_location_gestion_perdue` : les MANDATS DE GESTION PERDUS notés dans le fichier (colonnes « GESTION PERDU » /
--     « Loyers cc », 2025) — le mois, le bien rapproché (ou aucun : « non rattaché »), le propriétaire, les loyers cc du fichier,
--     le TAUX de gestion retenu et d'où il vient (conditions du bail, taux WIPPIMMO du bien, réglage de l'agence : toujours
--     dit), le commentaire. Ils entrent dans le bloc « Mandats de gestion perdus » du Suivi du mois et dans la balance ;
--   · `gestion_location_ecart_fichier` : les ÉCARTS EXPLIQUÉS entre un total du fichier et le calcul de l'outil (un total du
--     fichier qui oublie des lignes, une commission de vente ajoutée, les lignes d'un second négociateur) — affichés en petite
--     note dans la feuille du mois, le montant du fichier en info-bulle. L'outil garde le calcul juste.
-- Les deux ont une clé d'import UNIQUE : l'import est rejouable, rien n'est doublé. Une ligne s'annule (annule_le), jamais ne
-- se supprime.
-- IDEMPOTENTE (rejouable). Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction.

CREATE TABLE IF NOT EXISTS gestion_location_gestion_perdue (
  id                  bigserial PRIMARY KEY,
  mois                date NOT NULL CHECK (extract(day FROM mois) = 1),
  lot_id              bigint REFERENCES gestion_annuaire_lot(id),
  libelle_fichier     text NOT NULL CHECK (btrim(libelle_fichier) <> ''),
  proprietaire        text,
  loyers_cc           numeric(12,2) CHECK (loyers_cc IS NULL OR loyers_cc >= 0),
  taux_ht             numeric(6,3) CHECK (taux_ht IS NULL OR (taux_ht >= 0 AND taux_ht <= 100)),
  taux_source         text CHECK (taux_source IS NULL OR taux_source IN ('conditions', 'wippimmo', 'reglage')),
  commentaire         text,
  source              text NOT NULL DEFAULT 'import',
  import_cle          text UNIQUE,
  cree_le             timestamptz NOT NULL DEFAULT now(),
  cree_par_libelle    text,
  annule_le           timestamptz,
  annule_par_libelle  text
);
CREATE INDEX IF NOT EXISTS gestion_location_gestion_perdue_mois_idx ON gestion_location_gestion_perdue (mois);

CREATE TABLE IF NOT EXISTS gestion_location_ecart_fichier (
  id                  bigserial PRIMARY KEY,
  mois                date NOT NULL CHECK (extract(day FROM mois) = 1),
  champ               text NOT NULL CHECK (champ IN ('ca', 'apporteurs', 'primes', 'commission')),
  montant_fichier     numeric(14,4) NOT NULL,
  montant_outil       numeric(14,4) NOT NULL,
  libelle             text NOT NULL CHECK (btrim(libelle) <> ''),
  source              text NOT NULL DEFAULT 'import',
  import_cle          text UNIQUE,
  cree_le             timestamptz NOT NULL DEFAULT now(),
  cree_par_libelle    text,
  annule_le           timestamptz,
  annule_par_libelle  text
);
CREATE INDEX IF NOT EXISTS gestion_location_ecart_fichier_mois_idx ON gestion_location_ecart_fichier (mois);

COMMENT ON TABLE gestion_location_gestion_perdue IS
  'Mandats de gestion perdus notés dans le suivi mensuel (408) : mois, bien rapproché ou non, loyers cc, taux retenu et sa source. Annulés, jamais supprimés.';
COMMENT ON TABLE gestion_location_ecart_fichier IS
  'Écarts expliqués entre un total du suivi mensuel et le calcul de l''outil (408), montrés en note dans la feuille du mois.';
