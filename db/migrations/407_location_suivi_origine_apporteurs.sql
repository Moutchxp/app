-- 407_location_suivi_origine_apporteurs.sql — LOCATION « OUTILS DE SUIVI » (Arno, 23/10/2026) : ORIGINE DU CONTACT, ANNUAIRE
-- DES APPORTEURS RATTACHÉS À UN COLLÈGUE, PRIME DE GESTION AU CHOIX. Suite de la 406 (qu'elle suppose appliquée).
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL (aucune ligne existante n'est modifiée ni supprimée) :
--   · la fiche de l'apporteur : société, téléphone, e-mail ;
--   · `gestion_location_apporteur_collegue` : le COLLÈGUE DE RATTACHEMENT de chaque apporteur, DATÉ — la version en vigueur à
--     la date de signature d'une affaire fait foi : un changement de collègue ne réattribue jamais les affaires passées.
--     Un apporteur sans aucune ligne ici est « à rattacher » (il ne peut pas être choisi pour une nouvelle location) ;
--   · sur chaque ligne d'activité : l'ORIGINE DU CONTACT (collègue directement, apporteur d'affaires, Internet, recommandation
--     client, relocation, passage agence, campagne de communication), le collègue quand l'origine est « collègue
--     directement », et le CHOIX DE PRIME (la règle — 150 € —, personnalisée, aucune).
-- IDEMPOTENTE (rejouable). Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction.

ALTER TABLE gestion_location_apporteur ADD COLUMN IF NOT EXISTS societe text;
ALTER TABLE gestion_location_apporteur ADD COLUMN IF NOT EXISTS telephone text;
ALTER TABLE gestion_location_apporteur ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE gestion_location_apporteur ADD COLUMN IF NOT EXISTS modifie_le timestamptz;
ALTER TABLE gestion_location_apporteur ADD COLUMN IF NOT EXISTS modifie_par_libelle text;

CREATE TABLE IF NOT EXISTS gestion_location_apporteur_collegue (
  id                 bigserial PRIMARY KEY,
  apporteur_id       bigint NOT NULL REFERENCES gestion_location_apporteur(id),
  depuis             date NOT NULL,
  collegue_id        bigint,
  collegue_libelle   text NOT NULL CHECK (btrim(collegue_libelle) <> ''),
  saisi_le           timestamptz NOT NULL DEFAULT now(),
  saisi_par_libelle  text,
  UNIQUE (apporteur_id, depuis)
);

ALTER TABLE gestion_location_activite ADD COLUMN IF NOT EXISTS origine_contact text
  CHECK (origine_contact IS NULL OR origine_contact IN ('collegue', 'apporteur', 'internet', 'recommandation', 'relocation', 'passage_agence', 'campagne'));
ALTER TABLE gestion_location_activite ADD COLUMN IF NOT EXISTS collegue_id bigint;
ALTER TABLE gestion_location_activite ADD COLUMN IF NOT EXISTS collegue_libelle text;
ALTER TABLE gestion_location_activite ADD COLUMN IF NOT EXISTS prime_mode text
  CHECK (prime_mode IS NULL OR prime_mode IN ('regle', 'personnalise', 'aucune'));

COMMENT ON COLUMN gestion_location_activite.origine_contact IS
  'Origine du contact (407) : collegue, apporteur, internet, recommandation, relocation, passage_agence, campagne. NULL : historique non renseigné.';
COMMENT ON COLUMN gestion_location_activite.prime_mode IS
  'Prime de gestion (407) : regle (150 € de la règle datée), personnalise (prime_gestion_saisie), aucune. NULL : comme avant la 407.';
