-- 214_config_veille_seuil_destruction_emprise.sql — AFF-2 : SEUIL de DESTRUCTION d'un polygone existant par l'emprise projetée.
--
-- POURQUOI : les trois statuts d'affectation d'un bâtiment existant (préservé / partiellement détruit / détruit) se décident au vu du
-- TAUX de recouvrement du polygone par l'emprise projetée. Jusqu'ici la frontière « détruit » était le recouvrement TOTAL (≈ 100 %, à une
-- tolérance d'epsilon) — ce n'est plus la règle. La règle d'Arno : DÉTRUIT dès 75 % de recouvrement (par défaut), PARTIELLEMENT DÉTRUIT
-- entre le plancher anti-bruit et ce seuil, PRÉSERVÉ en dessous du plancher (aucun recouvrement réel). Ce seuil « détruit » (75 %) doit
-- être PILOTABLE au runtime (exigence « pilotage sans code »), pour qu'Arno l'ajuste depuis les Réglages plus tard — jamais une constante.
--
-- DEUX SEUILS DISTINCTS, ne pas confondre :
--   · rattachement_seuil_recouvrement_pct (migration 166, défaut 3) = PLANCHER anti-bruit de tracé : en dessous → aucun recouvrement
--     (préservé) ; au-dessus → le polygone est « concerné » (partiellement détruit ou détruit selon CE seuil-ci).
--   · rattachement_seuil_destruction_pct (CETTE migration, défaut 75) = seuil « DÉTRUIT » : taux ≥ seuil → détruit (le polygone d'origine
--     disparaît de la config projetée, altitudes du permis) ; plancher ≤ taux < seuil → partiellement détruit (mixte).
--
-- OÙ : `config_veille` (singleton id=1), FRÈRE de rattachement_seuil_recouvrement_pct — même table, même patron « entier en POURCENT,
-- lu au runtime avec repli sûr + provenance » (cf. app/lib/permis/rattachementConfig.ts). PAS dans config_scoring (moteur de score /
-- golden), PAS une constante en dur.
--
-- ENCODAGE : entier en POURCENT (défaut 75) pour coller au moteur de formulaire Réglages (type 'entier' + bornes tirées du CHECK, cf.
--   parserBornesCheck). Le code compare taux_pct >= seuil_pct (borne incluse). Plage [50 ; 100] : un seuil « détruit » sous 50 % n'a pas
--   de sens (un bâtiment majoritairement survivant n'est pas « détruit ») ; 100 % = « seulement recouvrement total ». Reste au-dessus du
--   plancher (3) par construction de la plage.
--
-- SÛR : DDL strictement ADDITIVE (ADD COLUMN IF NOT EXISTS, CHECK inline idempotent). Ne touche NI le moteur de verdict SVAV, NI le
-- golden, NI une ligne existante. N'alimente NI le verdict certifié NI une altitude (annotation de PROJECTION seulement). Idempotente.
-- Requiert `config_veille`. Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/214_config_veille_seuil_destruction_emprise.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS.

BEGIN;

ALTER TABLE config_veille
  ADD COLUMN IF NOT EXISTS rattachement_seuil_destruction_pct integer NOT NULL DEFAULT 75
    CHECK (rattachement_seuil_destruction_pct >= 50 AND rattachement_seuil_destruction_pct <= 100);

COMMENT ON COLUMN config_veille.rattachement_seuil_destruction_pct IS
  'AFF-2 — seuil (POURCENT de la surface du polygone) au-dessus duquel un bâtiment existant recouvert par l''emprise projetée est « DÉTRUIT » (polygone retiré de la config projetée, altitudes du permis). Entre le plancher anti-bruit (rattachement_seuil_recouvrement_pct) et CE seuil → « partiellement détruit » (mixte). Défaut 75. Plage [50 ; 100]. Lu au runtime (lireSeuilDestructionPct) avec repli sûr si la colonne est absente. PRÉVISION de PROJECTION : n''alimente NI le verdict certifié NI une altitude.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION (S'EXÉCUTE quand tu lances le fichier — AFFICHE le résultat) :
\echo '>>> colonne + défaut + NOT NULL :'
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_name = 'config_veille' AND column_name = 'rattachement_seuil_destruction_pct';
\echo '>>> CHECK (plage de validation, lue par le moteur de Réglages) :'
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid = 'config_veille'::regclass AND conname LIKE '%destruction%';
\echo '>>> valeur courante (singleton) :'
SELECT rattachement_seuil_destruction_pct FROM config_veille WHERE id = 1;
