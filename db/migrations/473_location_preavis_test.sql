-- 473_location_preavis_test.sql — LOCATION : LE « PRÉAVIS DE TEST » (Arno, 14/11/2026).
--
-- LE BESOIN : un administrateur éprouve lui-même, EN PRODUCTION et depuis son iPhone, tout le parcours d'un préavis (préavis, pré-visite,
-- invitation de début de pré-visite, compte rendu, sortie) sans qu'aucun client, partenaire ou collègue ne reçoive quoi que ce soit.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL : une table qui DÉSIGNE les biens fictifs des préavis de test. Un bien fictif (statut « location seule »,
-- aucun propriétaire, aucun dossier Drive) porte un locataire fictif dont l'e-mail est FORCÉ à l'adresse du compte créateur. Tout ce qui
-- se rattache à ce bien est « du test » : l'application le reconnaît par cette table, et
--   · ne laisse partir AUCUN mail ailleurs qu'à l'adresse du créateur (verrou au transport) ;
--   · l'exclut des compteurs, pastilles, alertes J+10, listes des autres, analyses.
-- « Supprimer ce préavis de test » ANNULE le préavis et la tâche, et MASQUE le test partout (`supprime_le`) : rien n'est effacé — les
-- verrous « historique inaltérable » (préavis, journal des mails, journal de gestion, pièces) restent entiers.
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE. Suppose la 253 (annuaire), la 383 (préavis).
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, le bouton « Préavis de test » dit « disponible après la mise à jour de la base
-- (migration 473) » et rien n'est créé ; aucun bien n'est « de test », tout le reste est inchangé.

CREATE TABLE IF NOT EXISTS gestion_location_preavis_test (
  id              bigserial PRIMARY KEY,
  lot_id          bigint NOT NULL UNIQUE REFERENCES gestion_annuaire_lot (id),
  locataire_id    bigint NOT NULL REFERENCES gestion_annuaire_locataire (id),
  occupation_id   bigint NOT NULL UNIQUE REFERENCES gestion_annuaire_occupation (id),
  createur_id     bigint NOT NULL,
  -- l'adresse du compte créateur, relue en base à la création : la SEULE adresse où un mail de ce test peut partir
  createur_email  text   NOT NULL CHECK (createur_email ~ '^[^@\s]+@[^@\s]+$'),
  cree_le         timestamptz NOT NULL DEFAULT now(),
  supprime_le     timestamptz NULL,
  supprime_par    text NULL
);

CREATE INDEX IF NOT EXISTS gestion_location_preavis_test_createur ON gestion_location_preavis_test (createur_id) WHERE supprime_le IS NULL;

COMMENT ON TABLE gestion_location_preavis_test IS
  'Préavis de test (473, Arno 14/11/2026) : bien et locataire FICTIFS ; mails uniquement vers createur_email ; exclus des compteurs, alertes, listes des autres et analyses ; supprime_le = masqué partout (rien n''est effacé).';

-- Ni DELETE ni TRUNCATE : un test « supprimé » est masqué, jamais effacé ; seule la colonne de masquage peut être posée, une fois.
CREATE OR REPLACE FUNCTION gestion_location_preavis_test_garde() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'gestion_location_preavis_test : un préavis de test se masque (supprime_le), il ne s''efface pas';
  END IF;
  IF NEW.lot_id IS DISTINCT FROM OLD.lot_id OR NEW.locataire_id IS DISTINCT FROM OLD.locataire_id OR NEW.occupation_id IS DISTINCT FROM OLD.occupation_id
     OR NEW.createur_id IS DISTINCT FROM OLD.createur_id OR NEW.createur_email IS DISTINCT FROM OLD.createur_email OR NEW.cree_le IS DISTINCT FROM OLD.cree_le
     OR OLD.supprime_le IS NOT NULL THEN
    RAISE EXCEPTION 'gestion_location_preavis_test : seul le masquage (supprime_le), une fois, est permis';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS gestion_location_preavis_test_garde_maj ON gestion_location_preavis_test;
CREATE TRIGGER gestion_location_preavis_test_garde_maj BEFORE UPDATE OR DELETE ON gestion_location_preavis_test
  FOR EACH ROW EXECUTE FUNCTION gestion_location_preavis_test_garde();
DROP TRIGGER IF EXISTS gestion_location_preavis_test_garde_vider ON gestion_location_preavis_test;
CREATE TRIGGER gestion_location_preavis_test_garde_vider BEFORE TRUNCATE ON gestion_location_preavis_test
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_location_preavis_test_garde();
