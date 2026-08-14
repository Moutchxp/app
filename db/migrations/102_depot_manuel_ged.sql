-- 102_depot_manuel_ged.sql — Module VEILLE PERMIS (chantier N1-A) : versement AUTOMATIQUE en GED des pièces reçues par e-mail.
-- ⚠️ POURQUOI : un e-mail dont l'objet est le seul mot « permis », venant d'une adresse CONNUE, avec pièces jointes, doit voir
-- ses pièces lues, le permis identifié, et TOUTES les pièces versées dans la GED de ce permis (dossier_document), le permis
-- basculant en Archives. On grave ici :
--   (1) config_veille.depot_adresses_connues — liste d'adresses (séparées par des virgules) reconnues pour ce versement (adresse
--       pro + perso du fondateur). UNION, au runtime, avec TOUTES les adresses de la table collaborateur (statut ignoré). Rangée
--       dans le thème « Réponses et échéances » de l'écran Réglages (E1/E2).
--   (2) depot_manuel_journal — journal d'IDEMPOTENCE au grain message : un message_id traité une fois n'est jamais retraité
--       (ni re-versé, ni ré-alerté, ni re-forwardé). Conserve l'issue et de quoi auditer (expéditeur, permis éventuel).
--   (3) UNIQUE (dossier_id, empreinte_sha256) sur dossier_document — filet DB contre le doublon exact d'un fichier sur un même
--       permis (le dédoublonnage se fait AUSSI en code, pièce par pièce, sur l'empreinte). ⚠️ NE POSER qu'après vérification
--       qu'aucun doublon PRÉEXISTANT ne l'empêche (cf. requête de contrôle en fin de fichier) — sinon la création échoue.
--
-- SÛR : DDL ADDITIVE (ADD COLUMN / CREATE TABLE / CREATE UNIQUE INDEX — tous IF NOT EXISTS). Aucun DROP, aucun UPDATE, aucun
-- trigger, aucun backfill. Ne touche NI demande.statut, NI le moteur de score (golden 29.107259068449615 intact). Idempotente.
-- Un seul BEGIN/COMMIT. Requiert 048 (config_veille), 089 (dossier_document). Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/102_depot_manuel_ged.sql
-- DRY-RUN (ne rien persister) : remplacer le « COMMIT; » final par « ROLLBACK; » avant de lancer. TU NE L'APPLIQUES PAS.
-- ⚠️ AVANT D'APPLIQUER : lancer la requête de contrôle des doublons (bloc final). Si elle renvoie ≥ 1 ligne, l'index unique
--   échouera : dédoublonner d'abord (ou retirer temporairement l'index de cette migration).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) config_veille.depot_adresses_connues — adresses reconnues pour le versement automatique (virgules). '' = aucune (le
--    versement ne s'appuie alors que sur les adresses des collaborateurs). Éditable depuis l'écran Réglages (thème Réponses).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS depot_adresses_connues text NOT NULL DEFAULT '';

COMMENT ON COLUMN config_veille.depot_adresses_connues IS
  'N1-A : adresses e-mail reconnues pour le versement automatique en GED (séparées par des virgules ; adresse pro + perso du fondateur). Union au runtime avec toutes les adresses de la table collaborateur (statut ignoré). Vide = seuls les collaborateurs sont reconnus.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) depot_manuel_journal — IDEMPOTENCE au grain message. PK = message_id → un ON CONFLICT DO NOTHING suffit à ne jamais
--    retraiter un mail. `issue` trace le sort du mail (verse | ambigu | aucun_candidat | extraction_echec).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS depot_manuel_journal (
  message_id   text        PRIMARY KEY,               -- Message-ID du mail traité (avec chevrons, tel que relevé)
  profil_boite text        NOT NULL,                  -- profil de boîte relevé (entreprise | personne)
  issue        text        NOT NULL,                  -- verse | ambigu | aucun_candidat | extraction_echec
  dossier_id   bigint      REFERENCES sitadel_dossier(id) ON DELETE SET NULL, -- permis versé (issue 'verse'), sinon NULL
  expediteur   text,                                  -- adresse d'origine (audit)
  traite_le    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE depot_manuel_journal IS
  'N1-A : journal d''idempotence du versement automatique en GED. UNE ligne par message_id traité → aucun mail retraité (ni re-versé, ni ré-alerté, ni re-forwardé). issue = sort du mail (verse | ambigu | aucun_candidat | extraction_echec).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) UNIQUE (dossier_id, empreinte_sha256) sur dossier_document — filet DB contre le doublon exact (mêmes octets, même permis).
--    Les empreintes NULL restent distinctes entre elles (sémantique NULL de Postgres) : les lignes historiques sans empreinte
--    ne se gênent pas. Le dédoublonnage principal reste en code (on ne verse que les empreintes absentes).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS dossier_document_dossier_empreinte_key
  ON dossier_document (dossier_id, empreinte_sha256);

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION PRÉ-APPLICATION (le doublon préexistant qui ferait ÉCHOUER l'index unique — à lancer AVANT le COMMIT) :
--   SELECT dossier_id, empreinte_sha256, count(*) AS n
--     FROM dossier_document WHERE empreinte_sha256 IS NOT NULL
--    GROUP BY dossier_id, empreinte_sha256 HAVING count(*) > 1;   -- attendu : 0 ligne. Sinon, dédoublonner d'abord.
--
-- VÉRIFICATION POST-APPLICATION :
--   SELECT column_name, is_nullable, column_default FROM information_schema.columns
--    WHERE table_name = 'config_veille' AND column_name = 'depot_adresses_connues';  -- text / NO / ''
--   \d depot_manuel_journal
--   SELECT indexname FROM pg_indexes WHERE tablename = 'dossier_document';           -- dossier_document_dossier_empreinte_key présent
