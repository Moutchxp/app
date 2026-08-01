-- 062_collaborateur.sql — Module VEILLE PERMIS (chantier S8a) : collaborateurs signataires + tourniquet d'attribution.
--
-- MOTIF : répartir les demandes entre les collaborateurs RÉELS de l'entreprise. Chaque collaborateur SIGNE en son nom
-- (nom, prénom, fonction) et reçoit les réponses sur SON e-mail — MAIS l'identité de la société (raison sociale, forme
-- juridique, siège) reste dans `config_demandeur` et est TOUJOURS mentionnée dans le courrier : l'équipe se répartit la
-- charge, elle ne se présente jamais comme des citoyens indépendants. AUCUN ENVOI n'est ajouté ici.
--
-- `collaborateur` porte le SIGNATAIRE et sa boîte de réponse. Désactivation (jamais de suppression) : un collaborateur
-- désactivé n'est plus choisi par le tourniquet, mais son historique de demandes reste intact et rattaché.
--
-- SÛR : DDL additive (CREATE TABLE + ADD COLUMN IF NOT EXISTS, FK nullable). Aucun DROP. Idempotent. GOLDEN-SAFE.
--
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/062_collaborateur.sql
-- Vérification : \d collaborateur · \d demande (collaborateur_id)

BEGIN;

CREATE TABLE IF NOT EXISTS collaborateur (
  id            bigserial PRIMARY KEY,
  nom           text NOT NULL,
  prenom        text NOT NULL,
  fonction      text NOT NULL,       -- ex. « chargé de recherche » ; apparaît comme qualité du signataire
  email         text NOT NULL,       -- adresse de RÉPONSE (dans le corps), pas le destinataire (qui reste la mairie)
  actif         boolean NOT NULL DEFAULT true,
  cree_le       timestamptz NOT NULL DEFAULT now(),
  desactive_le  timestamptz          -- renseigné à la désactivation ; jamais supprimé
);
COMMENT ON TABLE collaborateur IS 'Collaborateurs signataires des demandes de communication (S8a). Portent le SIGNATAIRE (nom/prénom/fonction) et la boîte de réponse (email). L''identité de la SOCIÉTÉ reste dans config_demandeur et figure toujours dans le courrier. Désactivation, jamais de suppression.';
CREATE UNIQUE INDEX IF NOT EXISTS collaborateur_email_key ON collaborateur (lower(email));
CREATE INDEX IF NOT EXISTS collaborateur_actif_idx ON collaborateur (actif);

-- Rattachement du signataire à la demande. NULL = les 99 demandes existantes (inchangées) et tout courrier sans
-- collaborateur (repli sur l'identité config_demandeur, comportement figé).
ALTER TABLE demande ADD COLUMN IF NOT EXISTS collaborateur_id bigint REFERENCES collaborateur(id);
COMMENT ON COLUMN demande.collaborateur_id IS 'Collaborateur signataire (S8a). NULL = signé par le représentant de config_demandeur (comportement historique figé). Le destinataire (dest_*) reste la mairie, jamais le collaborateur.';
CREATE INDEX IF NOT EXISTS demande_collaborateur_idx ON demande (collaborateur_id);

COMMIT;
