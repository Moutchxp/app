-- 504_gestion_copropriete_regroupement.sql — 🔴🔴 REGROUPER LES COPROPRIÉTÉS EN DOUBLE PAR VARIANTES D'ADRESSE (Arno, 19/11/2026).
--
-- LE CAS RÉEL : six « copropriétés » pour le 54 avenue Puvis de Chavannes, 92400 Courbevoie (« … / AUGIER », « … (HARY) », « 54 Avneue … »,
-- « 54 Puvis de Chavannes »…), toutes « fiche à créer » : la clé d'immeuble ne normalise que la casse, les accents et la ponctuation.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL :
--   · gestion_copropriete_regroupement — un geste « Regrouper » de la liste Copropriétés : la copropriété qui reçoit (l'adresse principale),
--     les écritures regroupées (libellés), qui et quand ; « Dégrouper » le CLÔT (degroupe_le, qui) — jamais effacé ;
--   · gestion_copropriete_adresse.regroupement_id — les adresses secondaires posées par ce regroupement (ce que « Dégrouper » retire, et rien d'autre) ;
--   · gestion_copropriete_doublon_ignore — « Ignorer » une proposition : sa signature (les clés des fiches, triées), qui et quand.
-- Aucune adresse de bien, aucune donnée WIPPIMMO, aucune copropriété existante touchées : le regroupement ajoute des adresses secondaires (335),
-- par lesquelles les biens des autres écritures rejoignent la copropriété et son syndic.
-- Sans la 504 : les propositions s'affichent, mais « Regrouper », « Dégrouper » et « Ignorer » refusent clairement (rien n'est écrit).
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe (psql -1). IDEMPOTENTE (IF NOT EXISTS) : rejouable.

CREATE TABLE IF NOT EXISTS gestion_copropriete_regroupement (
  id                   bigserial PRIMARY KEY,
  copropriete_id       bigint NOT NULL REFERENCES gestion_copropriete(id),
  principale           text NOT NULL CHECK (btrim(principale) <> ''),
  regroupees           text[] NOT NULL CHECK (cardinality(regroupees) >= 1),
  cree_le              timestamptz NOT NULL DEFAULT now(),
  cree_par             bigint,
  cree_par_libelle     text NOT NULL CHECK (btrim(cree_par_libelle) <> ''),
  degroupe_le          timestamptz,
  degroupe_par         bigint,
  degroupe_par_libelle text,
  CHECK (degroupe_le IS NULL OR degroupe_le >= cree_le)
);
CREATE INDEX IF NOT EXISTS gestion_copropriete_regroupement_par_copro ON gestion_copropriete_regroupement (copropriete_id);
COMMENT ON TABLE gestion_copropriete_regroupement IS
  'Regroupement de copropriétés en double par variantes d''adresse (504) : les écritures regroupées deviennent des adresses secondaires de la copropriété. Dégrouper le clôt (degroupe_le), jamais effacé.';

ALTER TABLE gestion_copropriete_adresse ADD COLUMN IF NOT EXISTS regroupement_id bigint REFERENCES gestion_copropriete_regroupement(id);
COMMENT ON COLUMN gestion_copropriete_adresse.regroupement_id IS
  'Le regroupement (504) qui a posé cette adresse secondaire ; NULL : posée à la main (fiche syndic, fiche copropriété, parcelle).';

CREATE TABLE IF NOT EXISTS gestion_copropriete_doublon_ignore (
  id               bigserial PRIMARY KEY,
  signature        text NOT NULL CHECK (btrim(signature) <> ''),
  cles             text[] NOT NULL,
  cree_le          timestamptz NOT NULL DEFAULT now(),
  cree_par         bigint,
  cree_par_libelle text NOT NULL CHECK (btrim(cree_par_libelle) <> '')
);
CREATE INDEX IF NOT EXISTS gestion_copropriete_doublon_ignore_signature ON gestion_copropriete_doublon_ignore (signature);
COMMENT ON TABLE gestion_copropriete_doublon_ignore IS
  '« Ignorer » une proposition de regroupement (504) : sa signature (clés des fiches triées), qui et quand. Une nouvelle écriture change la signature : la proposition revient.';
