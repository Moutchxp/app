-- 053_demande.sql — Module VEILLE PERMIS (chantier S7) : CONSTITUTION des demandes de communication (SANS ENVOI).
--
-- MOTIF : préparer des demandes CRPA (articles L311-1 / L311-9 3°) groupées par commune, prêtes à revue. Ce chantier
-- N'ENVOIE RIEN (l'envoi est le chantier suivant). Ne touche ni au verdict/score/certificat, ni à l'ingestion, ni à la
-- carte. GOLDEN-SAFE. Idempotent (IF NOT EXISTS, gardes DO/EXCEPTION, INSERT ON CONFLICT DO NOTHING).
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/053_demande.sql
-- Vérification : \d config_demandeur · \d demande · \d demande_dossier · \d demande_journal

BEGIN;

-- 1) IDENTITÉ DU DEMANDEUR — singleton (Arno remplit ; tout vide au départ).
--    ⚠️ GARDE-FOU STRUCTUREL (appliqué à la transition brouillon→prête, côté application) : une demande ne peut QUITTER
--    l'état 'brouillon' tant qu'un de ces champs (HORS telephone) est vide. Motif : c'est l'identité COMPLÈTE du
--    demandeur qui ouvre le recours devant la CADA en cas de silence de l'administration ; une demande anonyme prive
--    de tout recours. (Non exprimable en CHECK — la demande et l'identité sont deux tables ; vérifié dans `changerStatut`.)
CREATE TABLE IF NOT EXISTS config_demandeur (
  id                   integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  raison_sociale       text NOT NULL DEFAULT '',
  forme_juridique      text NOT NULL DEFAULT '',
  siege_adresse        text NOT NULL DEFAULT '',
  representant_nom      text NOT NULL DEFAULT '',
  representant_qualite  text NOT NULL DEFAULT '',
  email_contact        text NOT NULL DEFAULT '',
  telephone            text NOT NULL DEFAULT ''   -- SEUL champ optionnel (n'entre pas dans le garde-fou d'identité)
);
COMMENT ON TABLE config_demandeur IS 'Identité du demandeur (singleton). Tous les champs sauf telephone sont requis pour qu''une demande quitte l''état brouillon (recours CADA impossible si demande anonyme).';
INSERT INTO config_demandeur (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 2) Paramètres de constitution (rejoignent config_veille — pilotage sans code).
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS dossiers_par_demande          integer NOT NULL DEFAULT 5  CHECK (dossiers_par_demande BETWEEN 1 AND 20);
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS demandes_par_commune_par_mois integer NOT NULL DEFAULT 1  CHECK (demandes_par_commune_par_mois BETWEEN 1 AND 10);
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS pieces_demandees              text    NOT NULL DEFAULT 'PC2,PC3';

-- 3) Compteur de référence SVAV-DEM-AAAA-NNNNNN (même patron atomique que certificat_compteur).
CREATE TABLE IF NOT EXISTS demande_compteur (
  annee   integer PRIMARY KEY,
  dernier integer NOT NULL DEFAULT 0 CHECK (dernier >= 0)
);
COMMENT ON TABLE demande_compteur IS 'Compteur séquentiel du numéro de demande, par année (attribution atomique ON CONFLICT DO UPDATE, verrou de ligne).';

-- 4) DEMANDE. ⚠️ DESTINATAIRE FIGÉ À LA CRÉATION (dest_*) : le registre mairie_contact peut changer plus tard ; ce qu'on
--    a préparé ET à qui doit rester lisible tel quel des mois après (auditabilité). On copie donc canal/email/url/adresse.
CREATE TABLE IF NOT EXISTS demande (
  id                  bigserial PRIMARY KEY,
  reference           text UNIQUE NOT NULL CHECK (reference ~ '^SVAV-DEM-[0-9]{4}-[0-9]{6}$'),
  code_insee          char(5) NOT NULL REFERENCES commune(code_insee),
  statut              text NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon','prete','envoyee','close','abandonnee')),
  objet               text,
  corps               text,
  dest_canal          text,        -- figés à la création (copie de mairie_contact)
  dest_email          text,
  dest_url_formulaire text,
  dest_adresse_postale text,
  cree_le             timestamptz NOT NULL DEFAULT now(),
  maj_le              timestamptz NOT NULL DEFAULT now(),
  note                text
);
COMMENT ON TABLE demande IS 'Demande de communication (CRPA) préparée, groupée par commune. dest_* = destinataire FIGÉ à la création (le registre peut évoluer ; la demande reste auditable). Aucun envoi ici.';
CREATE INDEX IF NOT EXISTS demande_code_insee_idx ON demande (code_insee);
CREATE INDEX IF NOT EXISTS demande_statut_idx     ON demande (statut);

-- 5) Rattachement dossier ↔ demande. Un dossier ne peut être dans QU'UNE demande NON abandonnée : `actif` (= la demande
--    n'est pas abandonnée) + index unique partiel. Abandonner une demande met ses liens actif=false → dossiers libérés,
--    historique conservé.
CREATE TABLE IF NOT EXISTS demande_dossier (
  demande_id bigint NOT NULL REFERENCES demande(id),
  dossier_id bigint NOT NULL REFERENCES sitadel_dossier(id),
  actif      boolean NOT NULL DEFAULT true,
  PRIMARY KEY (demande_id, dossier_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS demande_dossier_unique_actif ON demande_dossier (dossier_id) WHERE actif;

-- 6) Journal APPEND-ONLY des transitions de statut.
CREATE TABLE IF NOT EXISTS demande_journal (
  id           bigserial PRIMARY KEY,
  demande_id   bigint NOT NULL,
  statut_avant text,
  statut_apres text,
  motif        text,
  auteur       text,
  horodatage   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS demande_journal_demande_idx ON demande_journal (demande_id, horodatage);

COMMIT;
