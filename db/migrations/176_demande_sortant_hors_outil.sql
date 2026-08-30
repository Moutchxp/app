-- 176_demande_sortant_hors_outil.sql — FIL-C : capturer les réponses qu'Arno a envoyées HORS OUTIL (depuis sa boîte) pour les faire
-- apparaître dans le fil d'échanges d'un permis.
--
-- ⚠️ POURQUOI : T7-C lit le dossier \Sent en EN-TÊTES SEULS et n'en persiste RIEN (juste un drapeau `repondu_auto_le` sur le reçu).
-- Le fil (FIL-A/B) ne montre donc que les envois passés par l'outil. Ce lot CAPTURE et STOCKE les sortants d'Arno appariés à un fil
-- suivi, pour que le fil soit complet — SANS dépendre d'IMAP au rendu (on stocke, on ne lit pas à la volée).
--
-- ═══ TABLE DÉDIÉE demande_sortant_hors_outil ═════════════════════════════════════════════════════════════════════════════════════
--   TABLE À PART (décision) : on n'ajoute AUCUNE ligne dans `demande_reponse`, dont toute la logique (compteurs, file à rattacher,
--   classification, relances, alertes) suppose que chaque ligne est un message REÇU. Ici, ce sont des SORTANTS. `message_id` UNIQUE =
--   dédoublonnage (un même sortant n'est jamais capturé deux fois ; la passe est idempotente). FK demande ON DELETE CASCADE.
--
-- 🔴 GARDE : ce lot ne touche NI le moteur SVAV, NI le verdict, NI le golden Asnières (29.107259068449615), NI config_scoring, NI les
--    gardes ETAN-1, NI `demande_reponse`, NI aucune donnée existante. Lecture IMAP STRICTE (EXAMINE) côté code, jamais un flag.
--
-- SÛR : CREATE TABLE / INDEX « IF NOT EXISTS ». Aucun DROP, aucune écriture de données. GOLDEN-SAFE. Idempotente. Une transaction.
-- Requiert demande (053). Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/176_demande_sortant_hors_outil.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

CREATE TABLE IF NOT EXISTS demande_sortant_hors_outil (
  id              bigserial   PRIMARY KEY,
  demande_id      bigint      NOT NULL REFERENCES demande(id) ON DELETE CASCADE,
  message_id      text        NOT NULL UNIQUE,   -- Message-ID du sortant (AVEC chevrons) — clé de déduplication
  in_reply_to     text,                          -- en-tête In-Reply-To du sortant
  references_brut text,                          -- en-tête References brut
  destinataire    text,                          -- adresse mairie visée (To/Cc apparié)
  objet           text,
  corps_texte     text,                          -- corps CAPTURÉ (dérogation assumée à « en-têtes seuls » de T7-C, bornée aux fils suivis)
  envoye_le       timestamptz,                   -- date d'envoi (en-tête Date du sortant)
  capture_le      timestamptz NOT NULL DEFAULT now(),
  capture_par     text
);

CREATE INDEX IF NOT EXISTS demande_sortant_hors_outil_demande_idx ON demande_sortant_hors_outil (demande_id);

COMMENT ON TABLE demande_sortant_hors_outil IS
  'FIL-C — réponses envoyées HORS OUTIL (depuis la boîte d''Arno) capturées dans le dossier \Sent et appariées à un fil de demande. Table DÉDIÉE (jamais demande_reponse, réservée aux REÇUS). message_id UNIQUE = dédup. Alimente le fil comme des envois « depuis la boîte ».';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (LECTURE SEULE) :
\echo '>>> table + colonnes :'
SELECT to_regclass('public.demande_sortant_hors_outil');
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'demande_sortant_hors_outil' ORDER BY ordinal_position;

-- ═════════════════════════════════════════════════════════════════════════════
-- 🔙 ROLLBACK : psql "$DATABASE_URL" -c "DROP TABLE IF EXISTS demande_sortant_hors_outil;"
