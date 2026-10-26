-- 430_location_rentre_occupe.sql — LOCATION (Arno, 26/10/2026) : LE BIEN « RENTRÉ OCCUPÉ ».
--
-- CONSTAT D'ARNO : un nouveau mandat de gestion confié avec un locataire déjà en place (CHALAH / REIFHI, locataire depuis 2014)
-- n'était pas identifiable dans « Nouvelles gestions du mois ». À la création d'un bien en gestion, une question : « Le bien est-il
-- loué au moment de la prise en gestion ? ». Oui : la gestion entre dans le suivi à la date du mandat de gestion, et le locataire en
-- place se saisit avec la date réelle de son bail — ce bail n'est jamais un bail signé par l'agence.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL :
--   · `gestion_annuaire_lot.entre_occupe` — la réponse : vrai (rentré occupé), faux (rentré vide), NULL (non renseigné : tous les
--     biens d'avant, qui ne basculent jamais d'eux-mêmes) ;
--   · `gestion_bail.en_place_prise_gestion` — le bail du locataire en place à la prise en gestion (mention sur la fiche ; son suivi
--     commercial est un « Mandat de gestion seul », jamais un bail signé : ni « Baux signés », ni honoraire de location).
--   · `gestion_bien_statut_effet_corrige` — la DATE D'EFFET CORRIGÉE d'une entrée en gestion déjà journalisée. Le journal des
--     transitions (`gestion_bien_statut_transition`) est en AJOUT SEUL (migration 403) : on n'y réécrit jamais une date. Pour un bien
--     existant reconnu « rentré occupé » (script `location:rentre-occupe`, décision d'Arno au cas par cas), la date du mandat se pose
--     ICI, et le suivi la lit à la place de la date d'origine ; retirer la correction (retire_le) rend la date d'origine. Ni DELETE ni
--     TRUNCATE (le verrou existant `gestion_rattachements_refuser_suppression`).
-- Chaque marque posée est écrite au journal append-only existant (`gestion_journal`).
--
-- AUCUNE ligne n'est modifiée ni supprimée : `entre_occupe` naît NULL, `en_place_prise_gestion` faux. IDEMPOTENTE (rejouable).
-- Pas de BEGIN/COMMIT : la mise à jour l'enveloppe dans UNE transaction.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, la question s'affiche avec la mention « disponible après la mise à jour »
-- et le bien se crée exactement comme aujourd'hui.

ALTER TABLE gestion_annuaire_lot ADD COLUMN IF NOT EXISTS entre_occupe boolean;
ALTER TABLE gestion_bail ADD COLUMN IF NOT EXISTS en_place_prise_gestion boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS gestion_bien_statut_effet_corrige (
  id                  bigserial   PRIMARY KEY,
  transition_id       bigint      NOT NULL REFERENCES gestion_bien_statut_transition(id),
  effet_le            date        NOT NULL,
  motif               text        NOT NULL CHECK (btrim(motif) <> ''),
  auteur_libelle      text        NOT NULL CHECK (btrim(auteur_libelle) <> ''),
  pose_le             timestamptz NOT NULL DEFAULT now(),
  retire_le           timestamptz,
  retire_par_libelle  text
);
CREATE UNIQUE INDEX IF NOT EXISTS gestion_bien_statut_effet_corrige_vivante_idx
  ON gestion_bien_statut_effet_corrige (transition_id) WHERE retire_le IS NULL;
DROP TRIGGER IF EXISTS gestion_bien_statut_effet_corrige_verrou_delete ON gestion_bien_statut_effet_corrige;
CREATE TRIGGER gestion_bien_statut_effet_corrige_verrou_delete BEFORE DELETE ON gestion_bien_statut_effet_corrige
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_rattachements_refuser_suppression();
DROP TRIGGER IF EXISTS gestion_bien_statut_effet_corrige_verrou_truncate ON gestion_bien_statut_effet_corrige;
CREATE TRIGGER gestion_bien_statut_effet_corrige_verrou_truncate BEFORE TRUNCATE ON gestion_bien_statut_effet_corrige
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_rattachements_refuser_suppression();

COMMENT ON TABLE gestion_bien_statut_effet_corrige IS
  'Date d''effet corrigée d''une entrée en gestion journalisée (bien rentré occupé : la date du mandat) ; la transition d''origine n''est jamais réécrite (migration 430).';
COMMENT ON COLUMN gestion_annuaire_lot.entre_occupe IS
  'Loué au moment de la prise en gestion : vrai = rentré occupé (entrée dans le suivi à la date du mandat), faux = rentré vide, NULL = non renseigné (migration 430).';
COMMENT ON COLUMN gestion_bail.en_place_prise_gestion IS
  'Bail du locataire en place à la prise en gestion : jamais un bail signé par l''agence (migration 430).';
