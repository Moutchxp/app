-- 166_config_veille_seuil_recouvrement_emprise.sql — RATT-5 : SEUIL de recouvrement d'un polygone par l'emprise projetée.
--
-- POURQUOI : jusqu'ici un polygone EFFLEURÉ par l'emprise (chevauchement > 0, même 1 %) était classé « recouvert » au même titre
-- qu'un polygone couvert à 100 %, et recevait un statut « détruit » ENTIER (RATT-2). RATT-5 a introduit ce seuil ; RATT-6 en change le
-- RÔLE : le statut auto se déduit désormais du taux à TROIS branches (taux ≥ 100 % → 'detruit' ; seuil ≤ taux < 100 % → 'mixte',
-- partiellement détruit ; taux < seuil → aucun statut). Le seuil n'arbitre donc plus « détruit vs préservé » mais devient un ANTI-BRUIT
-- DE TRACÉ : en dessous, un chevauchement est du bruit de tracé (un coin d'emprise qui mord un voisin) → aucun statut auto.
--
-- OÙ : `config_veille` (singleton id=1), FRÈRE des trois seuils du rattachement (rattachement_seuil_surface_pct / _bordure_pct /
-- marge_altitude_cm, migration 115) — même table, même patron « entier en POURCENT, lu au runtime avec repli sûr + provenance »
-- (cf. app/lib/permis/rattachementConfig.ts). PAS dans config_scoring (moteur de score / golden), PAS une constante en dur.
--
-- ENCODAGE : entier en POURCENT (défaut 3 — RATT-6 : anti-bruit de tracé, ex-50 de RATT-5) pour coller au moteur de formulaire Réglages
--   (type 'entier' + bornes tirées du CHECK, cf. parserBornesCheck). Le code compare taux_pct >= seuil_pct (borne incluse). Plage [3 ; 100]
--   (RATT-6 : plancher abaissé de 5 à 3 pour accueillir le défaut anti-bruit ; le plancher EST le niveau anti-bruit minimal, le plafond
--   100 % = « seulement recouvrement total »).
--
-- SÛR : DDL strictement ADDITIVE (ADD COLUMN IF NOT EXISTS, CHECK inline idempotent). Ne touche NI le moteur de verdict SVAV, NI le
-- golden, NI une ligne existante. Idempotente. Requiert `config_veille`. Application MANUELLE (Arno), arrêt au 1er échec :
--   set -a && source .env && set +a
--   psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/166_config_veille_seuil_recouvrement_emprise.sql
-- DRY-RUN : remplacer le « COMMIT; » final par « ROLLBACK; ». TU NE L'APPLIQUES PAS.

BEGIN;

ALTER TABLE config_veille
  ADD COLUMN IF NOT EXISTS rattachement_seuil_recouvrement_pct integer NOT NULL DEFAULT 3
    CHECK (rattachement_seuil_recouvrement_pct >= 3 AND rattachement_seuil_recouvrement_pct <= 100);

COMMENT ON COLUMN config_veille.rattachement_seuil_recouvrement_pct IS
  'RATT-5/RATT-6 — seuil (POURCENT de la surface du polygone) d''ANTI-BRUIT DE TRACÉ : en dessous, un chevauchement avec l''emprise projetée est ignoré (bruit) → aucun statut auto. Au-dessus, le statut auto se déduit du taux à trois branches : taux ≥ 100 % → « détruit » (recouvrement total) ; seuil ≤ taux < 100 % → « mixte » (partiellement détruit, fait géométrique NON modifiable) ; le tout étant une PRÉVISION + mention rouge. Défaut 3 (RATT-6). Lu au runtime (lireSeuilRecouvrementEmprisePct) avec repli sûr si la colonne est absente. N''alimente NI le verdict NI une altitude.';

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
