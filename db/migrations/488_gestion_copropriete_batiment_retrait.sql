-- 488_gestion_copropriete_batiment_retrait.sql — 🔴🔴 RETIRER UN BÂTIMENT DE LA COPROPRIÉTÉ (Arno, 17/11/2026).
--
-- LA DÉCISION (Arno, 17/11/2026) : « Le « − » sur un bâtiment déjà enregistré dans la copropriété mais SANS code : après confirmation (« Retirer le bâtiment X
-- de la copropriété ? Il ne sera plus proposé ; il reste dans l'historique »), le bâtiment est marqué retiré (date, auteur), jamais effacé ; il ne revient plus
-- à la réouverture ni dans le menu des bâtiments ; il peut être recréé ensuite par « Ajouter nouveau bâtiment » (il reprend alors sa ligne). Refus clair si un
-- bien est encore relié à ce bâtiment (dire lesquels). »
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL : une table des ÉTATS d'un bâtiment du registre (gestion_copropriete_batiment, qui ne s'efface jamais — 476) :
-- 'retire' (retiré de la copropriété) ou 'repris' (recréé par « Ajouter nouveau bâtiment »), avec la date et l'auteur. L'état d'un bâtiment est son DERNIER
-- événement (aucun : actif). La table est elle-même en ajout seul : ni UPDATE, ni DELETE, ni TRUNCATE (l'historique ne bouge jamais).
-- Aucune ligne existante touchée. Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE. RECETTE SEULEMENT.
-- ⚠️ Sans elle, le « − » d'un bâtiment sans code est refusé clairement (rien n'est écrit) ; tout le reste est inchangé.

CREATE TABLE IF NOT EXISTS gestion_copropriete_batiment_etat (
  id bigserial PRIMARY KEY,
  batiment_id bigint NOT NULL REFERENCES gestion_copropriete_batiment(id),
  etat text NOT NULL CHECK (etat IN ('retire', 'repris')),
  le timestamptz NOT NULL DEFAULT now(),
  par bigint,
  par_libelle text NOT NULL CHECK (btrim(par_libelle) <> '')
);
CREATE INDEX IF NOT EXISTS gestion_copropriete_batiment_etat_batiment_idx ON gestion_copropriete_batiment_etat (batiment_id, id DESC);

CREATE OR REPLACE FUNCTION gestion_copropriete_batiment_etat_refuser() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% : % refusé — l''historique des bâtiments de copropriété est en ajout seul (migration 488)', TG_TABLE_NAME, TG_OP;
END $$;
DROP TRIGGER IF EXISTS gestion_copropriete_batiment_etat_ajout_seul ON gestion_copropriete_batiment_etat;
CREATE TRIGGER gestion_copropriete_batiment_etat_ajout_seul BEFORE UPDATE OR DELETE ON gestion_copropriete_batiment_etat
  FOR EACH ROW EXECUTE FUNCTION gestion_copropriete_batiment_etat_refuser();
DROP TRIGGER IF EXISTS gestion_copropriete_batiment_etat_no_truncate ON gestion_copropriete_batiment_etat;
CREATE TRIGGER gestion_copropriete_batiment_etat_no_truncate BEFORE TRUNCATE ON gestion_copropriete_batiment_etat
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_copropriete_batiment_etat_refuser();

COMMENT ON TABLE gestion_copropriete_batiment_etat IS 'États d''un bâtiment de copropriété (retire / repris), date et auteur ; le dernier fait foi ; ajout seul — migration 488.';
