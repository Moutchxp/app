-- 513_location_restitution_vingt_pourcent.sql — 🔴 « RESTITUTION FAITE » DES 20 % RETENUS (Arno, 24/11/2026, écran « 20 % à restituer »).
--
-- LE BESOIN (demande d'Arno du 24/11/2026) : « Bouton « Restitution faite » sur chaque ligne : fenêtre avec date de restitution, montant restitué,
-- montant retenu au titre des charges (facultatif), commentaire ; enregistrement journalisé dans le dossier du locataire (rien n'est supprimé) ;
-- le locataire quitte la liste et ne déclenche plus d'alerte. Une section repliée « Restitutions faites (N) » en bas de page garde l'historique,
-- avec « Annuler » (journalisé) en cas d'erreur. Migration au prochain numéro libre (la 361 en attente garde le premier libre suivant). »
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL : une table de GESTES, en ajout seul (aucune ligne ne se modifie ni ne s'efface — déclencheurs) :
--   · « faite » : la restitution d'une sortie validée avec retenue (468) — date, montant restitué, montant retenu au titre des charges (facultatif),
--     commentaire, qui et quand ;
--   · « annulee » : l'annulation d'une restitution « faite » (elle-même conservée), qui et quand — une seule annulation par restitution.
-- Une restitution est EN COURS tant qu'aucune annulation ne la vise ; une seule en cours par sortie (vérifiée par l'application sous verrou).
-- Aucune donnée existante touchée, rien supprimé ni renommé. Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1).
-- IDEMPOTENTE : rejouable.
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, le bouton « Restitution faite » dit « disponible après la mise à jour de la base »,
-- et l'écran reste celui d'avant (toutes les sorties avec retenue listées).

CREATE TABLE IF NOT EXISTS gestion_location_restitution_vingt (
  id bigserial PRIMARY KEY,
  sortie_validee_id bigint NOT NULL REFERENCES gestion_location_sortie_validee(id),
  geste text NOT NULL CHECK (geste IN ('faite', 'annulee')),
  annule_id bigint NULL REFERENCES gestion_location_restitution_vingt(id),
  date_restitution date NULL,
  montant_restitue numeric(12, 2) NULL CHECK (montant_restitue IS NULL OR montant_restitue >= 0),
  montant_retenu_charges numeric(12, 2) NULL CHECK (montant_retenu_charges IS NULL OR montant_retenu_charges >= 0),
  commentaire text NULL,
  saisie_le timestamptz NOT NULL DEFAULT now(),
  saisie_par bigint NULL,
  saisie_par_libelle text NOT NULL CHECK (btrim(saisie_par_libelle) <> ''),
  CONSTRAINT gestion_location_restitution_vingt_forme_chk CHECK (
    (geste = 'faite' AND annule_id IS NULL AND date_restitution IS NOT NULL AND montant_restitue IS NOT NULL)
    OR (geste = 'annulee' AND annule_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS gestion_location_restitution_vingt_sortie ON gestion_location_restitution_vingt (sortie_validee_id, saisie_le DESC);
CREATE UNIQUE INDEX IF NOT EXISTS gestion_location_restitution_vingt_une_annulation ON gestion_location_restitution_vingt (annule_id) WHERE geste = 'annulee';

CREATE OR REPLACE FUNCTION gestion_location_restitution_vingt_ajout_seul() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% : table en ajout seul (migration 513) — rien ne se modifie ni ne s''efface ; une erreur s''annule par un geste « annulee »', TG_TABLE_NAME;
END $$;
DROP TRIGGER IF EXISTS gestion_location_restitution_vingt_ajout_seul ON gestion_location_restitution_vingt;
CREATE TRIGGER gestion_location_restitution_vingt_ajout_seul BEFORE UPDATE OR DELETE ON gestion_location_restitution_vingt
  FOR EACH ROW EXECUTE FUNCTION gestion_location_restitution_vingt_ajout_seul();
DROP TRIGGER IF EXISTS gestion_location_restitution_vingt_no_truncate ON gestion_location_restitution_vingt;
CREATE TRIGGER gestion_location_restitution_vingt_no_truncate BEFORE TRUNCATE ON gestion_location_restitution_vingt
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_location_restitution_vingt_ajout_seul();

COMMENT ON TABLE gestion_location_restitution_vingt IS
  'Restitutions des 20 % retenus (« faite ») et leurs annulations (« annulee »), en ajout seul ; une restitution est en cours tant qu''aucune annulation ne la vise — migration 513.';
