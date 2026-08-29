-- 166_config_veille_seuil_recouvrement_emprise.sql — RATT-5 : SEUIL de recouvrement d'un polygone par l'emprise projetée.
--
-- POURQUOI : jusqu'ici un polygone EFFLEURÉ par l'emprise (chevauchement > 0, même 1 %) était classé « recouvert » au même titre
-- qu'un polygone couvert à 100 %, et recevait un statut « détruit » ENTIER (RATT-2). Arno introduit un SEUIL : un polygone n'est
-- « recouvert » (→ détruit d'office, mention rouge) que si la PART de sa surface sous l'emprise atteint ce seuil. En dessous, il reste
-- un polygone existant ordinaire (statuable à la main, sans mention, sans auto-statut).
--
-- OÙ : `config_veille` (singleton id=1), FRÈRE des trois seuils du rattachement (rattachement_seuil_surface_pct / _bordure_pct /
-- marge_altitude_cm, migration 115) — même table, même patron « entier en POURCENT, lu au runtime avec repli sûr + provenance »
-- (cf. app/lib/permis/rattachementConfig.ts). PAS dans config_scoring (moteur de score / golden), PAS une constante en dur.
--
-- ENCODAGE : entier en POURCENT (défaut 50) pour coller au moteur de formulaire Réglages (type 'entier' + bornes tirées du CHECK,
--   cf. parserBornesCheck). Le code compare taux_pct >= seuil_pct (borne incluse). Plage [5 ; 100] : un plancher à 5 % interdit de
--   revenir au « moindre effleurement compte » (l'esprit du chantier), un plafond à 100 % = « seulement recouvrement total ».
--
-- SÛR : DDL strictement ADDITIVE (ADD COLUMN IF NOT EXISTS, CHECK inline idempotent). Ne touche NI le moteur de verdict SVAV, NI le
-- golden, NI une ligne existante. Idempotente. Requiert `config_veille`. Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/166_config_veille_seuil_recouvrement_emprise.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS.

BEGIN;

ALTER TABLE config_veille
  ADD COLUMN IF NOT EXISTS rattachement_seuil_recouvrement_pct integer NOT NULL DEFAULT 50
    CHECK (rattachement_seuil_recouvrement_pct >= 5 AND rattachement_seuil_recouvrement_pct <= 100);

COMMENT ON COLUMN config_veille.rattachement_seuil_recouvrement_pct IS
  'RATT-5 — seuil (en POURCENT de la surface du polygone) à partir duquel un polygone est considéré « recouvert » par l''emprise projetée : au-dessus, statut « détruit » posé d''office (prévision) + mention rouge ; en dessous, polygone existant ordinaire (statuable à la main, sans auto-statut). Défaut 50. Lu au runtime (lireSeuilRecouvrementEmprisePct) avec repli sûr sur le défaut si la colonne est absente. N''alimente NI le verdict NI une altitude (décision d''affichage/prévision).';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (S'EXÉCUTE quand tu lances le fichier — AFFICHE le résultat) :
\echo '>>> colonne + défaut + NOT NULL :'
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_name = 'config_veille' AND column_name = 'rattachement_seuil_recouvrement_pct';
\echo '>>> CHECK (plage de validation, lue par le moteur de Réglages) :'
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid = 'config_veille'::regclass AND conname LIKE '%recouvrement%';
\echo '>>> valeur courante (singleton) :'
SELECT rattachement_seuil_recouvrement_pct FROM config_veille WHERE id = 1;
