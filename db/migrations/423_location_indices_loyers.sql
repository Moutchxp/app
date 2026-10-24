-- 423_location_indices_loyers.sql — LOCATION : INDICES DE RÉVISION, INDICE DU BAIL, LOYERS RÉVISÉS (Arno, 25/10/2026).
--
-- DÉCISIONS D'ARNO :
--   · « Bloc “Indice des loyers” dans Nouveau locataire (et le Dossier de location) : type d'indice (IRL, ILC, ILAT, ICC), indice appliqué
--     (choisi parmi les indices déjà saisis, ou “+ Saisir un nouvel indice”), date de révision annuelle. Ces données vont sur les
--     conditions du bail, journalisées comme le reste. »
--   · « Pas d'INSEE pour l'instant : la table des indices est alimentée par les saisies du bloc et par l'onglet “Indices” de Paramètres
--     Location (saisie, correction, liste avec dernière utilisation). »
--   · « Ligne “Loyer révisé” (date d'effet, loyer HC, provisions) dans le Dossier de location ; prioritaire et affichée “réel”. »
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL (aucune ligne existante n'est modifiée ni supprimée) :
--   1. `gestion_location_indice` : la valeur d'un indice (type, année, trimestre). AJOUT SEUL (déclencheur) : une CORRECTION est une
--      nouvelle ligne qui désigne celle qu'elle remplace (`remplace_id`) — la valeur EN VIGUEUR d'un trimestre est sa ligne la plus
--      récente ; l'historique reste. Le doublon (même type + trimestre) est refusé par l'application, avec la valeur existante.
--   2. `gestion_location_conditions_entree` (le bail) : l'indice du bail — `indice_type`, `indice_annee`, `indice_trimestre` (le
--      trimestre de référence), `indice_valeur` (la valeur relevée à l'enregistrement, pour l'audit) — et `revision_le` (la date de
--      révision annuelle ; son jour et son mois reviennent chaque année). Chaque enregistrement des conditions reste une NOUVELLE ligne.
--   3. `gestion_location_loyer_revise` : un loyer RÉEL révisé d'un bail (date d'effet, loyer HC, provisions). Une ligne saisie par erreur
--      s'annule (`annule_le`, `annule_par_libelle`) : elle n'est jamais effacée.
-- IDEMPOTENTE (rejouable). Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION (`indicesDisponibles`) : sans elle, le bloc « Indice des loyers » dit « Mise à jour de la base
-- à appliquer (migration 423) » et n'est ni exigé ni enregistré ; l'onglet « Indices » le dit aussi ; le calcul mensuel n'a pas de révision.

CREATE TABLE IF NOT EXISTS gestion_location_indice (
  id bigserial PRIMARY KEY,
  type text NOT NULL CHECK (type IN ('irl', 'ilc', 'ilat', 'icc')),
  annee integer NOT NULL CHECK (annee BETWEEN 1950 AND 2200),
  trimestre smallint NOT NULL CHECK (trimestre BETWEEN 1 AND 4),
  valeur numeric(9,3) NOT NULL CHECK (valeur > 0),
  remplace_id bigint REFERENCES gestion_location_indice(id),
  motif text,
  saisi_le timestamptz NOT NULL DEFAULT now(),
  saisi_par bigint,
  saisi_par_libelle text NOT NULL
);
CREATE INDEX IF NOT EXISTS gestion_location_indice_trimestre_idx ON gestion_location_indice (type, annee, trimestre, id DESC);

COMMENT ON TABLE gestion_location_indice IS
  'Valeurs des indices de révision des loyers (IRL, ILC, ILAT, ICC) par trimestre (423). Ajout seul : une correction est une nouvelle ligne (remplace_id) ; la valeur en vigueur d''un trimestre est sa ligne la plus récente.';

CREATE OR REPLACE FUNCTION gestion_location_indice_ajout_seul() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'gestion_location_indice est en ajout seul : une correction est une nouvelle ligne (remplace_id).';
END $$;
DROP TRIGGER IF EXISTS gestion_location_indice_ajout_seul ON gestion_location_indice;
CREATE TRIGGER gestion_location_indice_ajout_seul BEFORE UPDATE OR DELETE ON gestion_location_indice
  FOR EACH ROW EXECUTE FUNCTION gestion_location_indice_ajout_seul();
DROP TRIGGER IF EXISTS gestion_location_indice_no_truncate ON gestion_location_indice;
CREATE TRIGGER gestion_location_indice_no_truncate BEFORE TRUNCATE ON gestion_location_indice
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_location_indice_ajout_seul();

ALTER TABLE gestion_location_conditions_entree ADD COLUMN IF NOT EXISTS indice_type text;
ALTER TABLE gestion_location_conditions_entree ADD COLUMN IF NOT EXISTS indice_annee integer;
ALTER TABLE gestion_location_conditions_entree ADD COLUMN IF NOT EXISTS indice_trimestre smallint;
ALTER TABLE gestion_location_conditions_entree ADD COLUMN IF NOT EXISTS indice_valeur numeric(9,3);
ALTER TABLE gestion_location_conditions_entree ADD COLUMN IF NOT EXISTS revision_le date;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_location_conditions_entree_indice_chk') THEN
    ALTER TABLE gestion_location_conditions_entree ADD CONSTRAINT gestion_location_conditions_entree_indice_chk
      CHECK ((indice_type IS NULL OR indice_type IN ('irl', 'ilc', 'ilat', 'icc')) AND (indice_trimestre IS NULL OR indice_trimestre BETWEEN 1 AND 4));
  END IF;
END $$;
COMMENT ON COLUMN gestion_location_conditions_entree.indice_type IS 'Indice de révision du bail (423) : irl, ilc, ilat ou icc.';
COMMENT ON COLUMN gestion_location_conditions_entree.indice_annee IS 'Indice de référence du bail (423) : son année.';
COMMENT ON COLUMN gestion_location_conditions_entree.indice_trimestre IS 'Indice de référence du bail (423) : son trimestre (1 à 4).';
COMMENT ON COLUMN gestion_location_conditions_entree.indice_valeur IS 'Valeur de l''indice de référence relevée à l''enregistrement (423, audit).';
COMMENT ON COLUMN gestion_location_conditions_entree.revision_le IS 'Date de révision annuelle du loyer (423) : son jour et son mois reviennent chaque année.';

CREATE TABLE IF NOT EXISTS gestion_location_loyer_revise (
  id bigserial PRIMARY KEY,
  bail_id bigint NOT NULL REFERENCES gestion_bail(id),
  effet_le date NOT NULL,
  loyer_hc numeric(12,2) NOT NULL CHECK (loyer_hc >= 0),
  provisions numeric(12,2) CHECK (provisions IS NULL OR provisions >= 0),
  saisi_le timestamptz NOT NULL DEFAULT now(),
  saisi_par bigint,
  saisi_par_libelle text NOT NULL,
  annule_le timestamptz,
  annule_par_libelle text
);
CREATE INDEX IF NOT EXISTS gestion_location_loyer_revise_bail_idx ON gestion_location_loyer_revise (bail_id, effet_le);
COMMENT ON TABLE gestion_location_loyer_revise IS
  'Loyers RÉELS révisés d''un bail (423), saisis dans le Dossier de location : prioritaires sur le loyer calculé (entrée × indices). Une ligne s''annule, jamais effacée.';
