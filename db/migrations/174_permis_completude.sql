-- 174_permis_completude.sql — PART-2 : diagnostic de complétude des pièces d'un permis. Pose les 4 familles ATTENDUES (pilotage sans
-- code) + la table qui MÉMORISE le classement des pièces (calcul coûteux par lecture de PDF), pour ne pas le refaire à chaque rendu.
--
-- ⚠️ POURQUOI : un permis en « Analyse et projection » a des documents en GED, mais rien ne disait « voici ce qui est attendu, voici
-- ce qui manque ». Le classement par CONTENU lit les PDF (coûteux) → on le calcule à la RELANCE de l'analyse et on mémorise le
-- résultat ; l'affichage relit la mémoire (aucune relecture PDF), et un changement de familles attendues prend effet immédiatement.
--
-- ═══ ① 4 FAMILLES ATTENDUES dans config_veille (singleton id=1) — interrupteurs cochables ═════════════════════════════════════════
--   Patron des interrupteurs (booléen NOT NULL DEFAULT true). Défaut : les 4 familles attendues. Décocher une famille → elle n'est
--   PLUS jamais signalée manquante. Lu au runtime avec repli sûr (les 4 à true). Familles : Cerfa, plan de masse, plan de coupe, étages.
--
-- ═══ ② TABLE permis_completude — MÉMOIRE du classement (1 ligne par permis) ═══════════════════════════════════════════════════════
--   Miroir de permis_bati_capture (résumé calculé, écrit à la demande, relu sans recalcul). `classements` = le classement PAR PIÈCE
--   (nom + famille retenue + contenu/nom + désaccord), en JSONB → l'affichage recompose présent/manquant selon la config VIVE, sans
--   relire les PDF. `nb_pieces` = nb de documents GED au moment du calcul → PÉREMPTION : si la GED en compte un nombre différent (une
--   pièce a été ajoutée), l'affichage sait que le diagnostic est à relancer. FK sitadel_dossier ON DELETE CASCADE.
--
-- 🔴 GARDE : ce lot ne touche NI le moteur de verdict SVAV, NI le golden Asnières (29.107259068449615), NI une altitude, NI
--    config_scoring, NI les gardes ETAN-1, NI aucune donnée existante. Aucune IA. Alerte/affichage seulement.
--
-- SÛR : ADD COLUMN / CREATE TABLE « IF NOT EXISTS ». Aucun DROP, aucune écriture de données. GOLDEN-SAFE. Idempotente. Une seule
-- transaction. Requiert config_veille (048) et sitadel_dossier. Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/174_permis_completude.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS (migration livrée NON APPLIQUÉE).

BEGIN;

-- ① Les 4 familles attendues (interrupteurs cochables, défaut activé).
ALTER TABLE config_veille
  ADD COLUMN IF NOT EXISTS famille_attendue_cerfa boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS famille_attendue_masse boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS famille_attendue_coupe boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS famille_attendue_etage boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN config_veille.famille_attendue_cerfa IS 'PART-2 — attendre un formulaire Cerfa dans les pièces d''un permis ? Décoché → jamais signalé manquant. Défaut true.';
COMMENT ON COLUMN config_veille.famille_attendue_masse IS 'PART-2 — attendre un plan de masse (PC2) ? Décoché → jamais signalé manquant. Défaut true.';
COMMENT ON COLUMN config_veille.famille_attendue_coupe IS 'PART-2 — attendre un plan de coupe (PC3) ? Décoché → jamais signalé manquant. Défaut true.';
COMMENT ON COLUMN config_veille.famille_attendue_etage IS 'PART-2 — attendre des plans d''étages ? Décoché → jamais signalé manquant. Défaut true.';

-- ② MÉMOIRE du classement des pièces (calcul coûteux mémorisé, relu sans recalcul).
CREATE TABLE IF NOT EXISTS permis_completude (
  dossier_id  bigint      PRIMARY KEY REFERENCES sitadel_dossier(id) ON DELETE CASCADE,
  classements jsonb       NOT NULL,   -- [{nomFichier, famille, parContenu, parNom, desaccord}] — recomposé à l'affichage selon la config vive
  nb_pieces   integer     NOT NULL,   -- nb de documents GED au calcul → péremption si la GED en compte un nombre différent
  calcule_le  timestamptz NOT NULL DEFAULT now(),
  calcule_par text
);

COMMENT ON TABLE permis_completude IS
  'PART-2 — mémoire du classement PAR CONTENU des pièces d''un permis (calculé à la relance de l''analyse, coûteux car lit les PDF). L''affichage recompose présent/manquant depuis `classements` selon les familles attendues VIVES, sans relire les PDF ; `nb_pieces` sert de sonde de péremption (pièce ajoutée → à relancer).';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (s'exécute au lancement — LECTURE SEULE) :
\echo '>>> ① interrupteurs familles attendues (type + défaut) :'
SELECT column_name, data_type, column_default FROM information_schema.columns
 WHERE table_name = 'config_veille' AND column_name LIKE 'famille_attendue_%' ORDER BY column_name;
\echo '>>> ② table mémoire :'
SELECT to_regclass('public.permis_completude');

-- ═════════════════════════════════════════════════════════════════════════════
-- 🔙 ROLLBACK (additive → réversible) :
--   psql "$DATABASE_URL" -c "BEGIN; \
--     ALTER TABLE config_veille DROP COLUMN IF EXISTS famille_attendue_cerfa, DROP COLUMN IF EXISTS famille_attendue_masse, \
--       DROP COLUMN IF EXISTS famille_attendue_coupe, DROP COLUMN IF EXISTS famille_attendue_etage; \
--     DROP TABLE IF EXISTS permis_completude; \
--     COMMIT;"
