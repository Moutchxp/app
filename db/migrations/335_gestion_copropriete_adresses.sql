-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 335 — LOT COPRO-PLUSIEURS-ADRESSES : UNE COPROPRIÉTÉ, PLUSIEURS ADRESSES
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
--
-- ARNO : « une grosse copropriété peut avoir PLUSIEURS adresses (12 rue X et 3 avenue Y = même immeuble, même syndic) ».
-- La copropriété garde son adresse PRINCIPALE (`gestion_copropriete.cle_immeuble`, inchangée) ; cette table lui donne
-- des adresses SECONDAIRES. Un lot du portefeuille dont l'« Immeuble » est une adresse secondaire EN COURS appartient à
-- cette copropriété (donc à son syndic, à ses contacts, à son carnet).
--
-- MIGRATION D'AJOUT UNIQUEMENT : une table neuve, AUCUNE donnée existante touchée.
--   · retrait HISTORISÉ (`retire_le`, qui), jamais effacé ;
--   · une adresse ne peut être secondaire que d'UNE copropriété à la fois (index unique partiel sur la clé en cours).
--     Qu'elle ne soit pas non plus l'adresse principale d'une AUTRE copropriété rattachée à un syndic, l'application le
--     vérifie (et le dit précisément) avant d'écrire.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS gestion_copropriete_adresse (
  id                 bigserial PRIMARY KEY,
  copropriete_id     bigint NOT NULL REFERENCES gestion_copropriete(id),
  cle_immeuble       text NOT NULL CHECK (btrim(cle_immeuble) <> ''),
  libelle            text NOT NULL CHECK (btrim(libelle) <> ''),
  code_postal        text,
  commune            text,
  cree_le            timestamptz NOT NULL DEFAULT now(),
  cree_par           bigint,
  cree_par_libelle   text NOT NULL,
  retire_le          timestamptz,
  retire_par_libelle text
);
CREATE UNIQUE INDEX IF NOT EXISTS gestion_copropriete_adresse_en_cours
  ON gestion_copropriete_adresse (cle_immeuble) WHERE retire_le IS NULL;
CREATE INDEX IF NOT EXISTS gestion_copropriete_adresse_par_copro ON gestion_copropriete_adresse (copropriete_id);
COMMENT ON TABLE gestion_copropriete_adresse IS
  'Lot COPRO-PLUSIEURS-ADRESSES (335) — les adresses SECONDAIRES d''une copropriété (la principale reste gestion_copropriete.cle_immeuble). Une adresse en cours n''appartient qu''à une copropriété. Retrait historisé, jamais effacé.';

COMMIT;
