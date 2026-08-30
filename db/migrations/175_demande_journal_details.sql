-- 175_demande_journal_details.sql — PART-3c : conserver l'OBJET et le CORPS RÉELLEMENT ENVOYÉS d'un complément de pièces.
--
-- ⚠️ POURQUOI : le texte du complément peut désormais être MODIFIÉ à la main avant l'envoi. Le journal doit donc garder la trace
-- EXACTE de ce qui est parti (objet + corps + familles demandées + destinataire + messageId) — trace opposable en cas de litige ou
-- de saisine CADA. `demande_journal.motif` (texte court) ne suffit plus ; on ajoute une colonne `details` JSONB GÉNÉRIQUE au journal
-- existant (réutilisé, pas de 2e journal).
--
-- ═══ COLONNE details JSONB (nullable) sur demande_journal ═════════════════════════════════════════════════════════════════════════
--   Nullable : les événements existants (relance, gestes dossier…) gardent `details = NULL`, comportement inchangé. L'écriture du
--   complément met le structuré ici. REPLI RUNTIME : tant que cette migration n'est pas appliquée (colonne absente), l'écrivain
--   retombe sur un `motif` enrichi (objet + corps inclus) → la trace opposable existe DANS LES DEUX CAS, jamais perdue.
--
-- 🔴 GARDE : ce lot ne touche NI le moteur SVAV, NI le verdict, NI le golden Asnières (29.107259068449615), NI config_scoring, NI les
--    gardes ETAN-1, NI aucune donnée existante. DDL strictement ADDITIVE.
--
-- SÛR : ADD COLUMN IF NOT EXISTS. Aucun DROP, aucune écriture de données. GOLDEN-SAFE. Idempotente. Une transaction. Requiert
-- demande_journal (053). Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/175_demande_journal_details.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

ALTER TABLE demande_journal ADD COLUMN IF NOT EXISTS details jsonb;

COMMENT ON COLUMN demande_journal.details IS
  'PART-3c — données structurées d''un événement (générique, nullable). Pour un complément de pièces : { objet, corps, familles, destinataire, messageId } réellement envoyés — trace opposable. NULL pour les événements qui n''en portent pas.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (LECTURE SEULE) :
\echo '>>> colonne details (attendu : jsonb, nullable) :'
SELECT column_name, data_type, is_nullable FROM information_schema.columns
 WHERE table_name = 'demande_journal' AND column_name = 'details';

-- ═════════════════════════════════════════════════════════════════════════════
-- 🔙 ROLLBACK : psql "$DATABASE_URL" -c "ALTER TABLE demande_journal DROP COLUMN IF EXISTS details;"
