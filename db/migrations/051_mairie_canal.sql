-- 051_mairie_canal.sql — Module VEILLE PERMIS (chantier S5b) : CANAL de contact des mairies.
--
-- MOTIF : les 30 communes « sans e-mail » ne sont pas des trous de l'annuaire — les grandes villes (Paris en tête,
-- 4 665 dossiers) ne publient AUCUNE adresse d'urbanisme et n'acceptent que le formulaire web ou le courrier. Le registre
-- ne savait pas le représenter → elles paraissaient « sans destinataire » à tort. On ajoute donc un CANAL.
--
-- Ce chantier ne touche NI au verdict/score/certificat, NI à l'ingestion Sitadel, NI au référentiel `commune`.
-- SÛR : DDL + amorce de données (35 lignes : 29 'inconnu' + Paris 'courrier'), tout JOURNALISÉ. Idempotent (IF NOT EXISTS,
-- gardes DO/EXCEPTION, backfill par WHERE ... IS NULL). GOLDEN-SAFE.
-- Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/051_mairie_canal.sql
-- Vérification : \d mairie_contact · SELECT canal, count(*) FROM mairie_contact GROUP BY canal;

BEGIN;

-- 1) Colonnes de canal. `canal` DEFAULT 'email' → les 305 lignes existantes (toutes avec e-mail) deviennent 'email',
--    cohérentes d'office.
ALTER TABLE mairie_contact ADD COLUMN IF NOT EXISTS canal          text NOT NULL DEFAULT 'email';
ALTER TABLE mairie_contact ADD COLUMN IF NOT EXISTS url_formulaire text;
ALTER TABLE mairie_contact ADD COLUMN IF NOT EXISTS adresse_postale text;

-- 2) Contraintes : liste fermée + cohérence (chaque canal exige SON champ). Gardées (idempotence).
DO $$ BEGIN
  ALTER TABLE mairie_contact ADD CONSTRAINT mairie_contact_canal_chk CHECK (canal IN ('email','formulaire','courrier','inconnu'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE mairie_contact ADD CONSTRAINT mairie_contact_coherence_chk CHECK (
    (canal <> 'email'      OR email           IS NOT NULL) AND
    (canal <> 'formulaire' OR url_formulaire  IS NOT NULL) AND
    (canal <> 'courrier'   OR adresse_postale IS NOT NULL)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Communes SANS ligne de contact (les sans-e-mail, SAUF Paris traité en 4) → canal='inconnu' (PAS 'courrier' :
--    on ne connaît pas encore leur voie de contact). Journalisé (une ligne par création). Idempotent (WHERE mc IS NULL).
WITH nouvelles AS (
  INSERT INTO mairie_contact (code_insee, email, source, statut, canal)
  SELECT c.code_insee, NULL, 'annuaire', 'presume', 'inconnu'
  FROM commune c LEFT JOIN mairie_contact mc ON mc.code_insee = c.code_insee
  WHERE mc.code_insee IS NULL AND c.code_insee <> '75056'
  RETURNING code_insee
)
INSERT INTO mairie_contact_journal (code_insee, email_avant, email_apres, source, motif, auteur)
SELECT code_insee, NULL, NULL, 'annuaire', 'migration 051 : canal=inconnu (aucun e-mail publié)', NULL FROM nouvelles;

-- 4) PARIS (75056) — amorce en canal='courrier'.
--    SOURCE : Ville de Paris — Direction de l'Urbanisme, Bureau Accueil et Service à l'Usager (BASU), guichet officiel
--    des demandes d'urbanisme (accès aux dossiers de permis). Adresse postale publique. Confirmée manuellement.
--    Journal d'ABORD (conditionnel → idempotent : rien si déjà en 'courrier'), PUIS upsert.
INSERT INTO mairie_contact_journal (code_insee, email_avant, email_apres, source, motif, auteur)
SELECT '75056',
       (SELECT email FROM mairie_contact WHERE code_insee = '75056'),
       NULL, 'saisie_manuelle', 'migration 051 : canal=courrier (BASU, Direction de l''Urbanisme de Paris)', NULL
WHERE NOT EXISTS (SELECT 1 FROM mairie_contact WHERE code_insee = '75056' AND canal = 'courrier');

INSERT INTO mairie_contact (code_insee, email, source, statut, canal, adresse_postale, maj_le)
VALUES ('75056', NULL, 'saisie_manuelle', 'confirme', 'courrier',
        'Direction de l''Urbanisme — Bureau Accueil et Service à l''Usager (BASU), 6 promenade Claude-Lévi-Strauss, CS 51388, 75639 PARIS CEDEX 13',
        now())
ON CONFLICT (code_insee) DO UPDATE SET
  canal = 'courrier', adresse_postale = EXCLUDED.adresse_postale, email = NULL,
  source = 'saisie_manuelle', statut = 'confirme', maj_le = now();

COMMIT;
