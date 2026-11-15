-- 474_location_previsite_brouillon.sql — LOCATION : LE BROUILLON DU COMPTE RENDU DE PRÉ-VISITE (Arno, 15/11/2026, 6e retour du test iPhone).
--
-- LE BESOIN : « aucune saisie ne doit jamais être perdue » — téléphone en veille plusieurs minutes, Chrome fermé ou rechargé, retour plus tard
-- depuis le lien du mail, réseau coupé dans le logement. Le formulaire enregistre tout seul, après chaque modification et à chaque passage en
-- arrière-plan, un BROUILLON rattaché à la pré-visite : texte, présences, personnes ajoutées et leurs notes, photos (pièces déjà déposées) et
-- légendes, fichiers vocaux (nom, prises déjà déposées, « envoyé aux locataires »), état du bouton d'envoi aux locataires. À la réouverture
-- (même lien, même appareil ou un autre), tout est restauré.
--
-- CE QU'ELLE FAIT, EN AJOUT SEUL : une table, UN brouillon vivant par pré-visite (index unique partiel). Rien n'est jamais effacé :
--   · « Effacer le brouillon » le MARQUE effacé (`efface_le`, `efface_motif` = 'efface') ;
--   · l'envoi du compte rendu le marque aussi (`efface_motif` = 'envoye') ;
--   · un nouveau brouillon peut ensuite naître pour la même pré-visite.
-- Les photos et les prises restent des pièces du stockage objet existant (jamais le Drive), déposées dès qu'elles sont prises : le brouillon
-- ne fait que les désigner par leur numéro ; elles sont conservées tant que la pré-visite n'est pas close (aucune purge des pièces).
-- Rien n'est envoyé à qui que ce soit avant « Confirmer et envoyer ».
-- Pas de BEGIN/COMMIT : l'appel l'enveloppe dans UNE transaction (psql -1). IDEMPOTENTE. Suppose la 464 (pré-visite).
--
-- ⚠️ LE CODE NE DÉPEND PAS DE CETTE MIGRATION : sans elle, le formulaire garde le brouillon SUR L'APPAREIL seulement (IndexedDB) et l'indicateur
-- le dit (« Brouillon gardé sur cet appareil ») ; tout le reste est inchangé.

CREATE TABLE IF NOT EXISTS gestion_location_previsite_brouillon (
  id              bigserial PRIMARY KEY,
  previsite_id    bigint NOT NULL REFERENCES gestion_location_previsite (id),
  occupation_ids  bigint[] NOT NULL CHECK (cardinality(occupation_ids) > 0),
  -- le contenu du formulaire, propre et borné par l'application (jamais un fichier : des numéros de pièces)
  contenu         jsonb NOT NULL CHECK (jsonb_typeof(contenu) = 'object' AND octet_length(contenu::text) <= 262144),
  version         integer NOT NULL DEFAULT 1 CHECK (version > 0),
  cree_le         timestamptz NOT NULL DEFAULT now(),
  enregistre_le   timestamptz NOT NULL DEFAULT now(),
  enregistre_par  text NULL,
  efface_le       timestamptz NULL,
  efface_motif    text NULL CHECK (efface_motif IS NULL OR efface_motif IN ('efface', 'envoye')),
  efface_par      text NULL,
  CHECK ((efface_le IS NULL) = (efface_motif IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS gestion_location_previsite_brouillon_vivant ON gestion_location_previsite_brouillon (previsite_id) WHERE efface_le IS NULL;

COMMENT ON TABLE gestion_location_previsite_brouillon IS
  'Brouillon du compte rendu de pré-visite (474, Arno 15/11/2026) : un vivant par pré-visite ; enregistré automatiquement ; effacé = marqué (efface_le, efface / envoye), jamais supprimé ; photos et prises désignées par leur numéro de pièce.';

-- Ni DELETE ni TRUNCATE ; un brouillon effacé ne se modifie plus, et ses désignations (pré-visite, occupations, création) ne changent jamais.
CREATE OR REPLACE FUNCTION gestion_location_previsite_brouillon_garde() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'gestion_location_previsite_brouillon : un brouillon se marque effacé (efface_le), il ne se supprime pas';
  END IF;
  IF OLD.efface_le IS NOT NULL OR NEW.previsite_id IS DISTINCT FROM OLD.previsite_id OR NEW.occupation_ids IS DISTINCT FROM OLD.occupation_ids
     OR NEW.cree_le IS DISTINCT FROM OLD.cree_le THEN
    RAISE EXCEPTION 'gestion_location_previsite_brouillon : un brouillon effacé ne change plus ; sa pré-visite et ses occupations non plus';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS gestion_location_previsite_brouillon_garde_maj ON gestion_location_previsite_brouillon;
CREATE TRIGGER gestion_location_previsite_brouillon_garde_maj BEFORE UPDATE OR DELETE ON gestion_location_previsite_brouillon
  FOR EACH ROW EXECUTE FUNCTION gestion_location_previsite_brouillon_garde();
DROP TRIGGER IF EXISTS gestion_location_previsite_brouillon_garde_vider ON gestion_location_previsite_brouillon;
CREATE TRIGGER gestion_location_previsite_brouillon_garde_vider BEFORE TRUNCATE ON gestion_location_previsite_brouillon
  FOR EACH STATEMENT EXECUTE FUNCTION gestion_location_previsite_brouillon_garde();
